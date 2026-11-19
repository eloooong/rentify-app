import { describe, expect, it } from "vitest";
import { reviewInput, type Review } from "@/lib/reviews/validation";
import {
  REVIEW_PANEL_START,
  bookingReviewUrl,
  canRetrySend,
  checkReviewDraft,
  commentCounter,
  commentLength,
  eligibilityNote,
  emptyReviewsText,
  formatAverage,
  formatReviewDate,
  parseReviewsView,
  profileReviewsApiUrl,
  ratingLabel,
  ratingSummaryLabel,
  reviewCountLabel,
  reviewPanelReducer,
  reviewProblem,
  reviewPrompt,
  reviewSourceLabel,
  reviewsHref,
  reviewsTotalPages,
  starFills,
  type ReviewPanelState,
} from "./reviews";

const PROFILE = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const RETURN_TO = `/bookings/${BOOKING}`;

const review: Review = {
  id: "44444444-4444-4444-8444-444444444444",
  author_id: "11111111-1111-4111-8111-111111111111",
  subject_id: PROFILE,
  author_name: "Demo Renter",
  subject_role: "owner",
  rating: 4,
  comment: "Smooth pickup.",
  created_at: "2026-11-06T02:30:00.123456+00:00",
};

describe("checkReviewDraft", () => {
  it("requires a whole rating from 1 to 5", () => {
    for (const rating of [null, 0, 6, 2.5, Number.NaN])
      expect(checkReviewDraft({ rating, comment: "" })).toEqual({
        ok: false,
        errors: { rating: "Choose a rating from 1 to 5 stars." },
      });
    for (const rating of [1, 5])
      expect(checkReviewDraft({ rating, comment: "" })).toEqual({
        ok: true,
        payload: { rating, comment: "" },
      });
  });

  it("trims surrounding ASCII spaces only, as the server does", () => {
    const check = checkReviewDraft({ rating: 4, comment: "  Great \n\t " });
    expect(check).toEqual({
      ok: true,
      payload: { rating: 4, comment: "Great \n\t" },
    });
    // The payload is exactly what the server stores, so a retry matches it.
    if (check.ok)
      expect(reviewInput.parse(check.payload)).toEqual(check.payload);
  });

  it("counts Unicode characters, not UTF-16 units, up to 2,000", () => {
    const emoji = "📷".repeat(2000);
    expect(emoji.length).toBe(4000);
    expect(commentLength(` ${emoji} `)).toBe(2000);
    expect(checkReviewDraft({ rating: 5, comment: emoji }).ok).toBe(true);
    expect(checkReviewDraft({ rating: 5, comment: `${emoji}a` })).toEqual({
      ok: false,
      errors: {
        comment: "Comments can be up to 2,000 characters. This one is 2,001.",
      },
    });
    expect(commentCounter("a".repeat(1500))).toBe("1,500 of 2,000 characters");
  });

  it("rejects NUL and reports both fields at once", () => {
    expect(checkReviewDraft({ rating: null, comment: "a\0b" })).toEqual({
      ok: false,
      errors: {
        rating: "Choose a rating from 1 to 5 stars.",
        comment: "Your comment has a character Rentify can't save.",
      },
    });
  });
});

describe("reviewProblem", () => {
  it("treats a lost send as safe to retry exactly", () => {
    const problem = reviewProblem(0, null, RETURN_TO, "send");
    expect(problem).toMatchObject({ kind: "temporary", retry: true });
    expect(problem.message).toBe(
      "We couldn't confirm your review was published.",
    );
    expect(reviewProblem(0, null, RETURN_TO).message).toMatch(/connection/);
  });

  it("sends a signed-out user to sign in and back", () => {
    expect(
      reviewProblem(401, { error: { code: "sign_in" } }, RETURN_TO),
    ).toMatchObject({
      kind: "sign_in",
      retry: false,
      action: {
        href: `/login?next=${encodeURIComponent(RETURN_TO)}`,
        label: "Sign in",
      },
    });
  });

  it.each([
    [409, "review_exists", "exists", false, true],
    [409, "review_not_allowed", "not_allowed", false, true],
    [409, "retry", "temporary", true, false],
    [403, "forbidden", "forbidden", false, true],
    [403, "origin", "invalid", false, false],
    [404, "not_found", "not_found", false, false],
    [400, "validation", "invalid", false, false],
    [413, undefined, "invalid", false, false],
    [415, undefined, "invalid", false, false],
    [429, "rate_limited", "rate_limited", true, false],
    [429, undefined, "rate_limited", true, false],
    [503, "unavailable", "temporary", true, false],
    [500, undefined, "temporary", true, false],
  ])("maps %i %s", (status, code, kind, retry, reload) => {
    const body = code ? { error: { code, message: "server text" } } : null;
    const problem = reviewProblem(status, body, RETURN_TO, "send");
    expect(problem).toMatchObject({ kind, retry, reload });
    // Server wording is never shown as-is.
    expect(problem.message).not.toContain("server text");
  });
});

describe("eligibilityNote", () => {
  it("explains each reason", () => {
    expect(eligibilityNote(null, "completed")).toBeNull();
    expect(eligibilityNote("already_reviewed", "completed")).toMatch(
      /can't be changed or deleted/,
    );
    expect(eligibilityNote("account_inactive", "completed")).toMatch(
      /active account with a verified email/,
    );
  });

  it("says whether an incomplete booking can still become reviewable", () => {
    expect(eligibilityNote("booking_incomplete", "paid")).toBe(
      "You can review this rental once it's completed.",
    );
    expect(eligibilityNote("booking_incomplete", "returned")).toBe(
      "You can review this rental once it's completed.",
    );
    for (const status of ["cancelled", "declined", "expired"] as const)
      expect(eligibilityNote("booking_incomplete", status)).toMatch(
        /nothing to review for this booking\.$/,
      );
  });
});

describe("display formatting", () => {
  it("names who is being reviewed from the viewer's side", () => {
    expect(reviewPrompt("renter", "Demo Owner")).toBe(
      "How was renting from Demo Owner?",
    );
    expect(reviewPrompt("owner", "Demo Renter")).toBe(
      "How was renting to Demo Renter?",
    );
    expect(reviewPrompt("owner", null)).toBe("How was renting to the renter?");
  });

  it("labels ratings, averages and counts", () => {
    expect(ratingLabel(1)).toBe("1 star, Poor");
    expect(ratingLabel(4)).toBe("4 stars, Very good");
    expect(formatAverage(null)).toBeNull();
    expect(formatAverage(5)).toBe("5.0");
    expect(formatAverage(4.5)).toBe("4.5");
    expect(formatAverage(4.67)).toBe("4.67");
    expect(reviewCountLabel(1)).toBe("1 review");
    expect(reviewCountLabel(1200)).toBe("1,200 reviews");
    expect(ratingSummaryLabel({ count: 0, average: null })).toBe(
      "No reviews yet",
    );
    expect(ratingSummaryLabel({ count: 3, average: 4.67 })).toBe(
      "Rated 4.67 out of 5 from 3 reviews",
    );
  });

  it("rounds stars to the nearest half", () => {
    expect(starFills(null)).toEqual(Array(5).fill("empty"));
    expect(starFills(4.67)).toEqual(["full", "full", "full", "full", "half"]);
    expect(starFills(4.2)).toEqual(["full", "full", "full", "full", "empty"]);
    expect(starFills(1.3)).toEqual(["full", "half", "empty", "empty", "empty"]);
    expect(starFills(5)).toEqual(Array(5).fill("full"));
  });

  it("says which side wrote a review and dates it in Manila", () => {
    expect(reviewSourceLabel("owner")).toBe("From a renter");
    expect(reviewSourceLabel("renter")).toBe("From an owner");
    // 23:30 UTC is the next morning in Manila.
    expect(formatReviewDate("2026-11-05T23:30:00+00:00")).toBe("Nov 6, 2026");
  });
});

describe("review list URLs", () => {
  it("parses the page and role, ignoring bad or repeated values", () => {
    expect(parseReviewsView({})).toEqual({ page: 1, role: null });
    expect(parseReviewsView({ page: "3", role: "renter" })).toEqual({
      page: 3,
      role: "renter",
    });
    expect(parseReviewsView({ page: "0", role: "admin" })).toEqual({
      page: 1,
      role: null,
    });
    expect(parseReviewsView({ page: ["2", "3"], role: ["owner"] })).toEqual({
      page: 1,
      role: null,
    });
  });

  it("builds page links and the API's exact query", () => {
    expect(reviewsHref(PROFILE, { page: 1, role: null })).toBe(
      `/reviews/${PROFILE}`,
    );
    expect(reviewsHref(PROFILE, { page: 2, role: "owner" })).toBe(
      `/reviews/${PROFILE}?role=owner&page=2`,
    );
    expect(profileReviewsApiUrl(PROFILE, { page: 1, role: null })).toBe(
      `/api/profiles/${PROFILE}/reviews?page=1&pageSize=10`,
    );
    expect(profileReviewsApiUrl(PROFILE, { page: 2, role: "renter" }, 50)).toBe(
      `/api/profiles/${PROFILE}/reviews?page=2&pageSize=50&role=renter`,
    );
    expect(bookingReviewUrl(BOOKING)).toBe(`/api/bookings/${BOOKING}/review`);
  });

  it("counts pages and words empty lists", () => {
    expect(reviewsTotalPages(0)).toBe(1);
    expect(reviewsTotalPages(10)).toBe(1);
    expect(reviewsTotalPages(11)).toBe(2);
    expect(emptyReviewsText(null)).toBe("No reviews yet.");
    expect(emptyReviewsText("owner")).toBe("No reviews as an owner yet.");
  });
});

describe("reviewPanelReducer", () => {
  const ready: ReviewPanelState = reviewPanelReducer(REVIEW_PANEL_START, {
    type: "loaded",
    canReview: true,
    reason: null,
    review: null,
  });
  const payload = { rating: 4, comment: "Smooth pickup." };

  it("keeps the exact payload for a retry after a lost response", () => {
    const sending = reviewPanelReducer(ready, { type: "sending", payload });
    expect(sending).toMatchObject({ sending: true, sent: payload });
    expect(canRetrySend(sending)).toBe(false);
    const failed = reviewPanelReducer(sending, {
      type: "send_failed",
      problem: reviewProblem(0, null, RETURN_TO, "send"),
    });
    expect(failed).toMatchObject({ sending: false, sent: payload });
    expect(canRetrySend(failed)).toBe(true);
  });

  it("offers no retry when the same send can't work", () => {
    const failed = reviewPanelReducer(
      reviewPanelReducer(ready, { type: "sending", payload }),
      {
        type: "send_failed",
        problem: reviewProblem(400, { error: { code: "validation" } }, "/"),
      },
    );
    expect(canRetrySend(failed)).toBe(false);
  });

  it("shows the published review and announces it, replayed or not", () => {
    const published = reviewPanelReducer(
      reviewPanelReducer(ready, { type: "sending", payload }),
      { type: "published", review, counterpart: "Demo Owner" },
    );
    expect(published).toMatchObject({
      canReview: false,
      reason: "already_reviewed",
      review,
      sending: false,
      sendProblem: null,
      announcement: { key: 1, text: "Your review of Demo Owner is published." },
    });
    expect(canRetrySend(published)).toBe(false);
  });

  it("never brings the form back over a published review", () => {
    const published = reviewPanelReducer(ready, {
      type: "published",
      review,
      counterpart: null,
    });
    const stale = reviewPanelReducer(published, {
      type: "loaded",
      canReview: true,
      reason: null,
      review: null,
    });
    expect(stale).toMatchObject({ canReview: false, review });
  });

  it("keeps showing what it had when a refetch fails", () => {
    const failed = reviewPanelReducer(ready, {
      type: "load_failed",
      problem: reviewProblem(503, null, RETURN_TO),
    });
    expect(failed).toMatchObject({ phase: "ready", canReview: true });
    expect(failed.loadProblem?.retry).toBe(true);
    const recovered = reviewPanelReducer(failed, {
      type: "loaded",
      canReview: false,
      reason: "already_reviewed",
      review,
    });
    expect(recovered).toMatchObject({ loadProblem: null, review });
  });
});
