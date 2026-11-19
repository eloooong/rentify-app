import { apiRequest } from "@/components/listings/api-request";
import {
  bookingReviewUrl,
  reviewProblem,
  type ReviewEligibilityReason,
  type ReviewPayload,
  type ReviewProblem,
} from "@/lib/listings/reviews";
import {
  reviewEligibility,
  submittedReview,
  type Review,
} from "@/lib/reviews/validation";

/** A stalled connection counts as a failed request, so the panel can't hang. */
const REQUEST_TIMEOUT_MS = 20_000;

function timedRequest(method: string, url: string, body?: unknown) {
  return Promise.race([
    apiRequest(method, url, body),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), REQUEST_TIMEOUT_MS),
    ),
  ]);
}

export type BookingReviewResult =
  | {
      ok: true;
      canReview: boolean;
      reason: ReviewEligibilityReason | null;
      review: Review | null;
    }
  | { ok: false; problem: ReviewProblem };

export async function fetchBookingReview(
  bookingId: string,
  returnTo: string,
): Promise<BookingReviewResult> {
  try {
    const result = await timedRequest("GET", bookingReviewUrl(bookingId));
    if (!result.ok)
      return {
        ok: false,
        problem: reviewProblem(result.status, result.json, returnTo),
      };
    const read = reviewEligibility.safeParse(result.json);
    if (!read.success || read.data.booking_id !== bookingId)
      return { ok: false, problem: reviewProblem(503, null, returnTo) };
    return {
      ok: true,
      canReview: read.data.can_review,
      reason: read.data.reason,
      review: read.data.review,
    };
  } catch {
    return { ok: false, problem: reviewProblem(0, null, returnTo) };
  }
}

export type SubmitReviewResult =
  | { ok: true; review: Review; replayed: boolean }
  | { ok: false; problem: ReviewProblem };

/** Sends exactly this rating and comment; repeating it is an exact retry. */
export async function submitBookingReview(
  bookingId: string,
  payload: ReviewPayload,
  returnTo: string,
): Promise<SubmitReviewResult> {
  try {
    const result = await timedRequest("POST", bookingReviewUrl(bookingId), {
      rating: payload.rating,
      comment: payload.comment,
    });
    if (!result.ok)
      return {
        ok: false,
        problem: reviewProblem(result.status, result.json, returnTo, "send"),
      };
    const sent = submittedReview.safeParse(result.json);
    // An unreadable success may still have published, so it's retried as-is.
    if (!sent.success)
      return {
        ok: false,
        problem: reviewProblem(0, null, returnTo, "send"),
      };
    return { ok: true, review: sent.data.data, replayed: sent.data.replayed };
  } catch {
    return { ok: false, problem: reviewProblem(0, null, returnTo, "send") };
  }
}
