import type { Review } from "@/lib/reviews/validation";
import {
  formatReviewDate,
  ratingLabel,
  reviewSourceLabel,
} from "@/lib/listings/reviews";
import { cn } from "@/lib/utils";
import { RatingStars } from "./rating-stars";

/**
 * One published review. The comment is rendered as text (React escapes it),
 * never as HTML, with its line breaks kept.
 */
export function ReviewCard({
  review,
  showSource = true,
  className,
}: {
  review: Review;
  /** Whether to say which side wrote it; the booking page already knows. */
  showSource?: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold text-fg">{review.author_name}</h3>
        <p className="text-sm text-muted-foreground">
          <time dateTime={review.created_at}>
            {formatReviewDate(review.created_at)}
          </time>
        </p>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <RatingStars rating={review.rating} />
        <span className="font-medium text-fg">
          {ratingLabel(review.rating)}
        </span>
        {showSource && (
          <span className="text-muted-foreground">
            <span aria-hidden="true">· </span>
            {reviewSourceLabel(review.subject_role)}
          </span>
        )}
      </p>
      {review.comment && (
        <p className="break-words whitespace-pre-line">{review.comment}</p>
      )}
    </article>
  );
}
