import type { ReactNode } from "react";

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
