"use client";

import { RATINGS, RATING_WORDS, ratingLabel } from "@/lib/listings/reviews";
import { cn } from "@/lib/utils";
import { StarIcon } from "./rating-stars";

/**
 * A 1–5 rating as native radio buttons in a fieldset: Tab reaches the group,
 * arrow keys change the choice, and each option is named "4 stars, Very good".
 * The stars are the visible labels; the focused one gets a ring.
 */
export function RatingInput({
  name,
  legend,
  value,
  onChange,
  error,
  errorId,
  disabled,
}: {
  name: string;
  legend: string;
  value: number | null;
  onChange: (rating: number) => void;
  error?: string;
  errorId: string;
  disabled?: boolean;
}) {
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
      className="flex flex-col gap-2"
    >
      <legend className="mb-2 font-medium text-fg">
        {legend}{" "}
        <span className="font-normal text-muted-foreground">(required)</span>
      </legend>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex">
          {RATINGS.map((rating) => (
            <label
              key={rating}
              className={cn(
                "flex size-11 cursor-pointer items-center justify-center rounded-lg",
                "has-focus-visible:ring-3 has-focus-visible:ring-ring has-focus-visible:outline-none",
                "hover:bg-surface-tint has-disabled:cursor-not-allowed has-disabled:opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={rating}
                checked={value === rating}
                onChange={() => onChange(rating)}
                className="sr-only"
              />
              <span className="sr-only">{ratingLabel(rating)}</span>
              <StarIcon
                fill={value !== null && rating <= value ? "full" : "empty"}
                className="size-7"
              />
            </label>
          ))}
        </div>
        <p aria-hidden="true" className="text-sm font-medium text-fg">
          {value ? RATING_WORDS[value] : "Not rated yet"}
        </p>
      </div>
      {error && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
