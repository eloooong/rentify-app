"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BookingRole, BookingStatus } from "@/lib/listings/booking-status";
import {
  REVIEW_COMMENT_MAX,
  REVIEW_PANEL_START,
  canRetrySend,
  checkReviewDraft,
  commentCounter,
  commentLength,
  eligibilityNote,
  reviewPanelReducer,
  reviewPrompt,
  type ReviewFieldErrors,
  type ReviewPayload,
  type ReviewProblem,
} from "@/lib/listings/reviews";
import { cn } from "@/lib/utils";
import { RatingInput } from "./rating-input";
import { ReviewCard } from "./review-card";
import { fetchBookingReview, submitBookingReview } from "./reviews-api";

/**
 * The booking page's review panel (A3.3). The server decides who may review
 * and who is reviewed; this shows its answer, the form while it allows one,
 * and the published review afterwards. Reviews can't be edited or deleted.
 */
export function ReviewPanel({
  bookingId,
  status,
  viewerRole,
  counterpart,
  returnTo,
}: {
  bookingId: string;
  status: BookingStatus;
  viewerRole: BookingRole;
  counterpart: string | null;
  returnTo: string;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reviewPanelReducer, REVIEW_PANEL_START);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<ReviewFieldErrors>({});
  const ids = useId();
  const ratingErrorId = `${ids}-rating-error`;
  const commentId = `${ids}-comment`;
  const commentHintId = `${ids}-comment-hint`;
  const commentCountId = `${ids}-comment-count`;
  const commentErrorId = `${ids}-comment-error`;

  const form = useRef<HTMLFormElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const published = useRef<HTMLDivElement>(null);
  const focusPublished = useRef(false);

  const load = useCallback(async () => {
    const result = await fetchBookingReview(bookingId, returnTo);
    if (result.ok)
      dispatch({
        type: "loaded",
        canReview: result.canReview,
        reason: result.reason,
        review: result.review,
      });
    else dispatch({ type: "load_failed", problem: result.problem });
  }, [bookingId, returnTo]);

  useEffect(() => {
    void load();
  }, [load]);

  // The form, and the button that had focus, are gone once the review is
  // published, so focus moves to the review itself.
  useEffect(() => {
    if (!state.review || !focusPublished.current) return;
    focusPublished.current = false;
    published.current?.focus();
  }, [state.review]);

  async function send(payload: ReviewPayload) {
    dispatch({ type: "sending", payload });
    const result = await submitBookingReview(bookingId, payload, returnTo);
    if (result.ok) {
      focusPublished.current = true;
      dispatch({ type: "published", review: result.review, counterpart });
      // The other person's rating on this page now includes this review.
      router.refresh();
      return;
    }
    dispatch({ type: "send_failed", problem: result.problem });
    // A "Try again" click removed its own button; give focus a place to land.
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) submit.current?.focus();
    });
    if (result.problem.reload) {
      if (result.problem.kind === "exists") focusPublished.current = true;
      void load();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.sending) return;
    const check = checkReviewDraft({ rating, comment });
    if (!check.ok) {
      setErrors(check.errors);
      const field = check.errors.rating
        ? form.current?.querySelector<HTMLInputElement>('input[type="radio"]')
        : document.getElementById(commentId);
      field?.focus();
      return;
    }
    setErrors({});
    void send(check.payload);
  }

  const counterpartRole = viewerRole === "owner" ? "renter" : "owner";
  const note = eligibilityNote(state.reason, status);
  const overLimit = commentLength(comment) > REVIEW_COMMENT_MAX;

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <h2 id={`${ids}-heading`} className="text-lg font-semibold text-fg">
        Your review
      </h2>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {state.announcement && (
          <p key={state.announcement.key}>{state.announcement.text}</p>
        )}
      </div>

      {state.loadProblem && (
        <ProblemBox
          problem={state.loadProblem}
          prefix={
            state.phase === "ready"
              ? "This may be out of date. "
              : "We couldn't load your review. "
          }
          onRetry={() => void load()}
        />
      )}

      {state.phase === "loading" ? (
        !state.loadProblem && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading your review…
          </p>
        )
      ) : state.review ? (
        <div
          ref={published}
          tabIndex={-1}
          className="flex flex-col gap-3 rounded-lg focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        >
          <p>
            {eligibilityNote("already_reviewed", status)} It&apos;s shown on the{" "}
            {counterpartRole}&apos;s public reviews.
          </p>
          <ReviewCard review={state.review} showSource={false} />
        </div>
      ) : state.canReview ? (
        <form
          ref={form}
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
        >
          <RatingInput
            name={`${ids}-rating`}
            legend={reviewPrompt(viewerRole, counterpart)}
            value={rating}
            onChange={(value) => {
              setRating(value);
              setErrors((current) => ({ ...current, rating: undefined }));
            }}
            error={errors.rating}
            errorId={ratingErrorId}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor={commentId}>
              Comment{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Textarea
              id={commentId}
              rows={4}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                setErrors((current) => ({ ...current, comment: undefined }));
              }}
              aria-invalid={errors.comment ? true : undefined}
              aria-describedby={cn(
                commentHintId,
                commentCountId,
                errors.comment && commentErrorId,
              )}
              className="min-h-28 text-base"
            />
            <p
              id={commentCountId}
              className={cn(
                "text-sm",
                overLimit
                  ? "font-medium text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {commentCounter(comment)}
            </p>
            {errors.comment && (
              <p
                id={commentErrorId}
                className="text-sm font-medium text-destructive"
              >
                {errors.comment}
              </p>
            )}
            <p id={commentHintId} className="text-sm text-muted-foreground">
              Your review is public as soon as you publish it and can&apos;t be
              edited or deleted. Leave out phone numbers, email addresses and
              payment details.
            </p>
          </div>
          <Button
            ref={submit}
            type="submit"
            size="lg"
            aria-disabled={state.sending || undefined}
            className="min-h-11 w-full sm:w-fit"
          >
            {state.sending ? "Publishing…" : "Publish review"}
          </Button>
        </form>
      ) : (
        note && <p>{note}</p>
      )}

      {state.sendProblem && (
        <ProblemBox
          problem={state.sendProblem}
          // A retryable failure may have published, so it isn't called a failure.
          prefix={
            state.review || state.sendProblem.retry
              ? ""
              : "Your review wasn't published. "
          }
          onRetry={
            canRetrySend(state) && state.sent
              ? () => void send(state.sent as ReviewPayload)
              : undefined
          }
          retryLabel="Try again"
          retryNote="Trying again sends the same rating and comment, so it can't be published twice."
        />
      )}
    </section>
  );
}

function ProblemBox({
  problem,
  prefix,
  onRetry,
  retryLabel = "Try again",
  retryNote,
}: {
  problem: ReviewProblem;
  prefix: string;
  onRetry?: () => void;
  retryLabel?: string;
  retryNote?: string;
}) {
  const canRetry = Boolean(onRetry && problem.retry);
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm"
    >
      <div className="min-w-0 flex-1 basis-60">
        <p>
          {prefix}
          {problem.message}
        </p>
        {canRetry && retryNote && (
          <p className="mt-1 text-muted-foreground">{retryNote}</p>
        )}
      </div>
      {problem.action ? (
        <Button asChild variant="outline" size="lg" className="min-h-11">
          <Link href={problem.action.href}>{problem.action.label}</Link>
        </Button>
      ) : (
        canRetry && (
          <Button
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={onRetry}
          >
            {retryLabel}
          </Button>
        )
      )}
    </div>
  );
}
