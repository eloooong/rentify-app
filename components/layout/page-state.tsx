import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A whole-page message for missing pages and pages that failed to load
 * (`not-found.tsx` and `error.tsx`). Inline empty states inside a page use
 * the bordered panel pattern instead.
 */
export function PageState({
  title,
  alert = false,
  actions,
  children,
}: {
  title: ReactNode;
  /** Announce the message, for errors. */
  alert?: boolean;
  /** Buttons or links shown under the message. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      role={alert ? "alert" : undefined}
      className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 px-4 py-16 sm:px-6"
    >
      <h1 className="text-2xl font-semibold text-fg">{title}</h1>
      {children}
      {actions && <div className="mt-2 flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

const WIDTH = {
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
} as const;

/**
 * Placeholder blocks shown by `loading.tsx` while a signed-in page loads.
 * The pulse stops under "reduce motion" (see globals.css).
 */
export function PageSkeleton({
  label,
  width = "3xl",
}: {
  /** What is loading, read by screen readers. */
  label: string;
  width?: keyof typeof WIDTH;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-4 py-8 sm:px-6",
        WIDTH[width],
      )}
      aria-busy="true"
    >
      <p role="status" className="sr-only">
        {label}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-2/3 max-w-xs animate-pulse rounded bg-surface-muted" />
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-surface-muted" />
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-lg border border-border bg-surface-muted"
          />
        ))}
      </div>
    </div>
  );
}
