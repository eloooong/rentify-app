import type { Metadata } from "next";
import Link from "next/link";
import { HistoryFilters } from "@/components/bookings/history-filters";
import { TransactionItem } from "@/components/bookings/transaction-item";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import {
  HistoryError,
  listMyHistory,
  type HistoryPage,
} from "@/lib/listings/bookings";
import {
  hasFilters,
  historyHref,
  interpretHistoryError,
  parseHistoryParams,
  rangeError,
} from "@/lib/listings/history";
import type { BookingProblem } from "@/lib/listings/booking-dates";

export const metadata: Metadata = {
  title: "Transaction history | Rentify",
  robots: { index: false, follow: false },
};

export default async function HistoryPage(
  props: PageProps<"/bookings/history">,
) {
  const query = parseHistoryParams(await props.searchParams);
  const returnTo = historyHref(query);
  await requireUser(returnTo);

  const datesError = rangeError(query);
  let result: HistoryPage | null = null;
  let problem: BookingProblem | null = null;
  if (!datesError) {
    try {
      result = await listMyHistory(query);
    } catch (error) {
      problem = interpretHistoryError(
        error instanceof HistoryError ? error.code : "unavailable",
        returnTo,
      );
    }
  }
  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / result.pageSize))
    : 1;
  const filtered = hasFilters(query);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link
          href="/bookings"
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-fg hover:underline"
        >
          ← Bookings
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-fg">
          Transaction history
        </h1>
        <p className="mt-1 text-muted-foreground">
          Payments and refund attempts on bookings you rent or host.
        </p>
      </div>

      <HistoryFilters query={query} rangeError={datesError} />

      {datesError ? null : problem ? (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface-muted p-6"
        >
          <h2 className="text-lg font-semibold text-fg">
            We couldn&apos;t load your history
          </h2>
          <p className="mt-1">{problem.message}</p>
          {problem.action && (
            <Button asChild variant="outline" className="mt-4">
              <Link href={problem.action.href}>{problem.action.label}</Link>
            </Button>
          )}
        </div>
      ) : !result ? null : result.total === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-fg">
            {filtered
              ? "No transactions match these filters"
              : "No transactions yet"}
          </h2>
          <p className="mt-1">
            {filtered
              ? "Try another type, side or date range."
              : "Payments and refunds for your bookings show up here once they happen."}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={filtered ? "/bookings/history" : "/bookings"}>
              {filtered ? "Clear filters" : "Go to bookings"}
            </Link>
          </Button>
        </div>
      ) : result.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-fg">
            This page is past your last transaction
          </h2>
          <Button asChild variant="outline" className="mt-4">
            <Link href={historyHref(query, { page: 1 })}>
              Back to the first page
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? "transaction" : "transactions"}
            , newest first
          </p>
          <ul className="flex flex-col gap-3">
            {result.items.map((item) => (
              <TransactionItem key={item.id} item={item} />
            ))}
          </ul>

          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-between gap-3 border-t border-border pt-4"
            >
              {query.page > 1 ? (
                <Button asChild variant="outline">
                  <Link
                    href={historyHref(query, { page: query.page - 1 })}
                    rel="prev"
                  >
                    Previous
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted-foreground">
                Page {query.page} of {totalPages}
              </p>
              {query.page < totalPages ? (
                <Button asChild variant="outline">
                  <Link
                    href={historyHref(query, { page: query.page + 1 })}
                    rel="next"
                  >
                    Next
                  </Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Each payment and refund attempt is listed on its own, and Rentify
        doesn&apos;t add them up: a pending or failed refund hasn&apos;t
        returned any money, and seeing a payment on a booking you host
        isn&apos;t a payout. Test mode: no real money moves. Times are in Manila
        time.
      </p>
    </div>
  );
}
