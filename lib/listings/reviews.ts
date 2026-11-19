import type { Review } from "@/lib/reviews/validation";
import type { BookingProblem } from "./booking-dates";
import {
  STATUS_TONE,
  type BookingRole,
  type BookingStatus,
} from "./booking-status";
import { parseMessagesPage } from "./chat";

/*
 * Pure helpers for two-sided reviews and rating displays (A3.3), following
 * Person B's contract (lib/reviews/README.md). Reviews publish immediately and
 * can't be edited or deleted, and the server derives who is reviewed.
 */

export const REVIEW_COMMENT_MAX = 2000;
export const REVIEWS_PAGE_SIZE = 10;
export const RATINGS = [1, 2, 3, 4, 5] as const;

export type ReviewRole = Review["subject_role"];
export type ReviewEligibilityReason =
  "already_reviewed" | "booking_incomplete" | "account_inactive";
export type RatingSummary = { count: number; average: number | null };

/** What each star means, read out with the rating and shown once chosen. */
export const RATING_WORDS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very good",
  5: "Excellent",
};

/** The contract trims surrounding ASCII spaces only, not other whitespace. */
function trimComment(raw: string): string {
  return raw.replace(/^ +| +$/g, "");
}

/** Length as the server counts it: Unicode characters, after trimming. */
export function commentLength(raw: string): number {
  return Array.from(trimComment(raw)).length;
}

export function commentCounter(raw: string): string {
  return `${commentLength(raw).toLocaleString("en-PH")} of 2,000 characters`;
}

export type ReviewDraft = { rating: number | null; comment: string };
export type ReviewPayload = { rating: number; comment: string };
export type ReviewFieldErrors = { rating?: string; comment?: string };

export type ReviewDraftCheck =
  | { ok: true; payload: ReviewPayload }
  | { ok: false; errors: ReviewFieldErrors };

/** The same rules as the server, with the exact body to send on success. */
export function checkReviewDraft(draft: ReviewDraft): ReviewDraftCheck {
  const errors: ReviewFieldErrors = {};
  const rating = draft.rating;
  if (
    rating === null ||
    !Number.isInteger(rating) ||
    rating < RATINGS[0] ||
    rating > RATINGS[RATINGS.length - 1]
  )
    errors.rating = "Choose a rating from 1 to 5 stars.";
  const comment = trimComment(draft.comment);
  const length = Array.from(comment).length;
  if (comment.includes("\0"))
    errors.comment = "Your comment has a character Rentify can't save.";
  else if (length > REVIEW_COMMENT_MAX)
    errors.comment = `Comments can be up to 2,000 characters. This one is ${length.toLocaleString("en-PH")}.`;
  if (errors.rating || errors.comment) return { ok: false, errors };
  return { ok: true, payload: { rating: rating as number, comment } };
}

export function bookingReviewUrl(bookingId: string): string {
  return `/api/bookings/${bookingId}/review`;
}

export type ReviewProblemKind =
  | "sign_in"
  | "rate_limited"
  | "exists"
  | "not_allowed"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "temporary";

export type ReviewProblem = BookingProblem & {
  kind: ReviewProblemKind;
  /** Sending the same rating and comment again is safe and may work. */
  retry: boolean;
  /** The booking's review state changed; read it again to show the truth. */
  reload: boolean;
};

type ErrorBody = { error?: { code?: unknown } };

/** What to show for a failed review request. Status 0 means no response. */
export function reviewProblem(
  status: number,
  body: unknown,
  returnTo: string,
  context: "load" | "send" = "load",
): ReviewProblem {
  const code = (body as ErrorBody | null)?.error?.code;
  const problem = (
    kind: ReviewProblemKind,
    message: string,
    flags: { retry?: boolean; reload?: boolean } = {},
  ): ReviewProblem => ({
    kind,
    message,
    retry: flags.retry ?? false,
    reload: flags.reload ?? false,
  });
  if (status === 0)
    return problem(
      "temporary",
      // A lost response can hide a review that was published; an exact retry
      // replays it instead of posting another.
      context === "send"
        ? "We couldn't confirm your review was published."
        : "We couldn't reach Rentify. Check your connection and try again.",
      { retry: true },
    );
  if (code === "sign_in" || status === 401)
    return {
      ...problem("sign_in", "Your session ended. Sign in again to continue."),
      action: {
        href: `/login?next=${encodeURIComponent(returnTo)}`,
        label: "Sign in",
      },
    };
  if (code === "rate_limited" || status === 429)
    return problem(
      "rate_limited",
      "That was a lot of requests. Wait a moment, then try again.",
      { retry: true },
    );
  if (code === "review_exists")
    return problem(
      "exists",
      "You've already published a review for this rental, and it can't be changed.",
      { reload: true },
    );
  if (code === "review_not_allowed")
    return problem(
      "not_allowed",
      "Reviews open only after the rental is completed.",
      { reload: true },
    );
  if (code === "retry")
    return problem(
      "temporary",
      "Rentify was busy. Try again with the same rating and comment.",
      { retry: true },
    );
  if (code === "not_found" || status === 404)
    return problem(
      "not_found",
      "This booking isn't available. It may belong to another account, or the link may be wrong.",
    );
  if (code === "forbidden")
    return problem(
      "forbidden",
      "Only an active account with a verified email and a saved profile can publish reviews.",
      { reload: true },
    );
  if (status >= 400 && status < 500)
    return problem(
      "invalid",
      context === "send"
        ? "Rentify couldn't accept this review. Check the rating and comment, then try again."
        : "Rentify couldn't load this review. Refresh the page and try again.",
    );
  return problem(
    "temporary",
    "Reviews are temporarily unavailable. Please try again shortly.",
    { retry: true },
  );
}

/** Why this participant can't write a review now, or null when they can. */
export function eligibilityNote(
  reason: ReviewEligibilityReason | null,
  status: BookingStatus,
): string | null {
  switch (reason) {
    case null:
      return null;
    case "already_reviewed":
      return "Your review is published. Reviews can't be changed or deleted.";
    case "account_inactive":
      return "Your account can't publish reviews right now. Reviews need an active account with a verified email and a saved profile.";
    case "booking_incomplete":
      return STATUS_TONE[status] === "closed" && status !== "completed"
        ? "Only completed rentals can be reviewed, so there's nothing to review for this booking."
        : "You can review this rental once it's completed.";
  }
}

/** The form's legend: who is being rated, from this participant's side. */
export function reviewPrompt(
  viewerRole: BookingRole,
  counterpart: string | null,
): string {
  const name =
    counterpart ?? (viewerRole === "owner" ? "the renter" : "the owner");
  return viewerRole === "owner"
    ? `How was renting to ${name}?`
    : `How was renting from ${name}?`;
}

export function ratingLabel(rating: number): string {
  const stars = `${rating} ${rating === 1 ? "star" : "stars"}`;
  return RATING_WORDS[rating] ? `${stars}, ${RATING_WORDS[rating]}` : stars;
}

/** Up to two decimals, as the server rounds; null when there are no reviews. */
export function formatAverage(average: number | null): string | null {
  if (average === null) return null;
  return average.toLocaleString("en-PH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

export function reviewCountLabel(count: number): string {
  return `${count.toLocaleString("en-PH")} ${count === 1 ? "review" : "reviews"}`;
}

/** The whole summary as one sentence, for screen readers. */
export function ratingSummaryLabel(summary: RatingSummary): string {
  const average = formatAverage(summary.average);
  if (summary.count === 0 || average === null) return "No reviews yet";
  return `Rated ${average} out of 5 from ${reviewCountLabel(summary.count)}`;
}

export type StarFill = "full" | "half" | "empty";

/** Five stars for a rating, rounded to the nearest half star. */
export function starFills(rating: number | null): StarFill[] {
  const halves = rating === null ? 0 : Math.round(rating * 2);
  return RATINGS.map((star) =>
    halves >= star * 2 ? "full" : halves === star * 2 - 1 ? "half" : "empty",
  );
}

/** The reviewed person's role decides who wrote it: renters review owners. */
export function reviewSourceLabel(subjectRole: ReviewRole): string {
  return subjectRole === "owner" ? "From a renter" : "From an owner";
}

export function formatReviewDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

export type ReviewsView = { page: number; role: ReviewRole | null };

/** Bad or repeated URL values fall back to the first page of everything. */
export function parseReviewsView(
  params: Record<string, string | string[] | undefined>,
): ReviewsView {
  const role =
    params.role === "owner" || params.role === "renter" ? params.role : null;
  return { page: parseMessagesPage(params), role };
}

export function reviewsHref(profileId: string, view: ReviewsView): string {
  const params = new URLSearchParams();
  if (view.role) params.set("role", view.role);
  if (view.page > 1) params.set("page", String(view.page));
  const query = params.toString();
  return `/reviews/${profileId}${query ? `?${query}` : ""}`;
}

/** The API rejects unknown or repeated parameters, so this is its exact shape. */
export function profileReviewsApiUrl(
  profileId: string,
  view: ReviewsView,
  pageSize: number = REVIEWS_PAGE_SIZE,
): string {
  const params = new URLSearchParams({
    page: String(view.page),
    pageSize: String(pageSize),
  });
  if (view.role) params.set("role", view.role);
  return `/api/profiles/${profileId}/reviews?${params}`;
}

export function reviewsTotalPages(
  total: number,
  pageSize: number = REVIEWS_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export const ROLE_FILTERS: { role: ReviewRole | null; label: string }[] = [
  { role: null, label: "All" },
  { role: "owner", label: "As an owner" },
  { role: "renter", label: "As a renter" },
];

export function emptyReviewsText(role: ReviewRole | null): string {
  if (role === "owner") return "No reviews as an owner yet.";
  if (role === "renter") return "No reviews as a renter yet.";
  return "No reviews yet.";
}

/*
 * The booking page's review panel. A send freezes the exact rating and comment
 * so "Try again" repeats them: the server replays an exact retry instead of
 * publishing twice, and rejects a changed one with review_exists.
 */

export type ReviewPanelState = {
  /** Stays "loading" until the first successful read, even after an error. */
  phase: "loading" | "ready";
  canReview: boolean;
  reason: ReviewEligibilityReason | null;
  review: Review | null;
  loadProblem: ReviewProblem | null;
  /** The rating and comment last sent; "Try again" sends exactly this. */
  sent: ReviewPayload | null;
  sending: boolean;
  sendProblem: ReviewProblem | null;
  /** A new key replaces the live region's text, so it is read out again. */
  announcement: { key: number; text: string } | null;
};

export const REVIEW_PANEL_START: ReviewPanelState = {
  phase: "loading",
  canReview: false,
  reason: null,
  review: null,
  loadProblem: null,
  sent: null,
  sending: false,
  sendProblem: null,
  announcement: null,
};

export type ReviewPanelAction =
  | {
      type: "loaded";
      canReview: boolean;
      reason: ReviewEligibilityReason | null;
      review: Review | null;
    }
  | { type: "load_failed"; problem: ReviewProblem }
  | { type: "sending"; payload: ReviewPayload }
  | { type: "published"; review: Review; counterpart: string | null }
  | { type: "send_failed"; problem: ReviewProblem };

function announce(
  state: ReviewPanelState,
  text: string,
): ReviewPanelState["announcement"] {
  return { key: (state.announcement?.key ?? 0) + 1, text };
}

export function reviewPanelReducer(
  state: ReviewPanelState,
  action: ReviewPanelAction,
): ReviewPanelState {
  switch (action.type) {
    case "loaded":
      return {
        ...state,
        phase: "ready",
        // A published review is final, so a stale read can't bring the form back.
        canReview: state.review ? false : action.canReview,
        reason: state.review ? "already_reviewed" : action.reason,
        review: action.review ?? state.review,
        loadProblem: null,
      };
    case "load_failed":
      return { ...state, loadProblem: action.problem };
    case "sending":
      return {
        ...state,
        sent: action.payload,
        sending: true,
        sendProblem: null,
      };
    case "published":
      return {
        ...state,
        phase: "ready",
        canReview: false,
        reason: "already_reviewed",
        review: action.review,
        sending: false,
        sendProblem: null,
        announcement: announce(
          state,
          `Your review${action.counterpart ? ` of ${action.counterpart}` : ""} is published.`,
        ),
      };
    case "send_failed":
      return { ...state, sending: false, sendProblem: action.problem };
  }
}

/** Whether "Try again" is offered: only for a send that may still work as it is. */
export function canRetrySend(state: ReviewPanelState): boolean {
  return Boolean(
    state.sent && state.sendProblem?.retry && !state.sending && !state.review,
  );
}
