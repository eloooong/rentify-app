import Link from "next/link";
import {
  formatAverage,
  ratingSummaryLabel,
  reviewCountLabel,
  type RatingSummary as Summary,
} from "@/lib/listings/reviews";
import { cn } from "@/lib/utils";
import { RatingStars } from "./rating-stars";

/**
 * A profile's average and review count, with a link to the reviews when there
 * are any. A summary that couldn't be loaded says so instead of claiming none.
 */
export function RatingSummary({
  summary,
  href,
  size = "sm",
  className,
}: {
  summary: Summary | null;
  href?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  if (!summary)
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Ratings are unavailable right now.
      </p>
    );

  const average = formatAverage(summary.average);
  const large = size === "lg";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1",
        large ? "text-base" : "text-sm",
        className,
      )}
    >
      <p className="flex items-center gap-2">
        <span className="sr-only">{ratingSummaryLabel(summary)}</span>
        <RatingStars
          rating={summary.average}
          starClassName={large ? "size-6" : undefined}
        />
        <span
          aria-hidden="true"
          className={cn(
            "text-fg",
            large ? "text-2xl font-semibold" : "font-medium",
          )}
        >
          {average ?? "No reviews yet"}
        </span>
        {average && (
          <span aria-hidden="true" className="text-muted-foreground">
            ({reviewCountLabel(summary.count)})
          </span>
        )}
      </p>
      {href && summary.count > 0 && (
        <Link
          href={href}
          className="font-medium text-fg underline underline-offset-4 hover:text-brand-strong"
        >
          See {summary.count === 1 ? "the review" : "all reviews"}
        </Link>
      )}
    </div>
  );
}
