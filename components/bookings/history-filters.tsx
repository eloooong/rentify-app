import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ROLE_OPTIONS,
  TYPE_OPTIONS,
  hasFilters,
  type HistoryQuery,
} from "@/lib/listings/history";

// Matches the Input styles so the native selects sit with the date fields.
const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base text-fg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/**
 * Type, role and date filters. A plain GET form, so it works before the
 * page's JavaScript loads and every filter lives in the URL.
 */
export function HistoryFilters({
  query,
  rangeError,
}: {
  query: HistoryQuery;
  rangeError: string | null;
}) {
  return (
    <form
      method="get"
      action="/bookings/history"
      aria-label="Filter transactions"
      className="flex flex-col gap-4 rounded-lg border border-border p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="history-type">Type</Label>
          <select
            id="history-type"
            name="type"
            defaultValue={query.type ?? ""}
            className={SELECT_CLASS}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ""}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="history-role">Side</Label>
          <select
            id="history-role"
            name="role"
            defaultValue={query.role}
            className={SELECT_CLASS}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="history-from">From</Label>
          <Input
            id="history-from"
            name="from"
            type="date"
            defaultValue={query.from ?? ""}
            aria-invalid={rangeError ? true : undefined}
            aria-describedby="history-dates-hint"
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="history-to">To</Label>
          <Input
            id="history-to"
            name="to"
            type="date"
            defaultValue={query.to ?? ""}
            aria-invalid={rangeError ? true : undefined}
            aria-describedby={
              rangeError
                ? "history-dates-error history-dates-hint"
                : "history-dates-hint"
            }
            className="h-9"
          />
        </div>
      </div>
      <p id="history-dates-hint" className="text-sm text-muted-foreground">
        Dates are when the payment or refund happened, in Manila time, and
        include both days.
      </p>
      {rangeError && (
        <p
          id="history-dates-error"
          role="alert"
          className="text-sm font-medium text-destructive"
        >
          {rangeError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Apply filters</Button>
        {hasFilters(query) && (
          <Button asChild variant="outline">
            <Link href="/bookings/history">Clear filters</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
