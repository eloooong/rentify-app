import { starFills, type StarFill } from "@/lib/listings/reviews";
import { cn } from "@/lib/utils";

const STAR_PATH =
  "M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95L12 2.5z";

/** One star: an outline, with the fill clipped to half for a half star. */
export function StarIcon({
  fill,
  className,
}: {
  fill: StarFill;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-block size-4 shrink-0", className)}
    >
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-0 size-full fill-none stroke-brand-strong"
        strokeWidth={1.5}
        strokeLinejoin="round"
      >
        <path d={STAR_PATH} />
      </svg>
      {fill !== "empty" && (
        <svg
          viewBox="0 0 24 24"
          className={cn(
            "absolute inset-0 size-full fill-brand-strong stroke-brand-strong",
            fill === "half" && "[clip-path:inset(0_50%_0_0)]",
          )}
          strokeWidth={1.5}
          strokeLinejoin="round"
        >
          <path d={STAR_PATH} />
        </svg>
      )}
    </span>
  );
}

/**
 * Five stars for a rating. Decorative: callers always print the rating as
 * text too, so the stars are hidden from screen readers.
 */
export function RatingStars({
  rating,
  className,
  starClassName,
}: {
  rating: number | null;
  className?: string;
  starClassName?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("flex gap-0.5", className)}>
      {starFills(rating).map((fill, index) => (
        <StarIcon key={index} fill={fill} className={starClassName} />
      ))}
    </span>
  );
}
