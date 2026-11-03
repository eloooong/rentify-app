import type { Metadata } from "next";
import Link from "next/link";
import { BookingActions } from "@/components/bookings/booking-actions";
import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/listings/booking-dates";
import {
  STATUS_FILTERS,
  STATUS_LABEL,
  bookingsHref,
  displayStatus,
  parseBookingsParams,
  statusHint,
} from "@/lib/listings/booking-status";
import { listMyBookings, type BookingsPage } from "@/lib/listings/bookings";
import { formatMoney } from "@/lib/listings/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Bookings | Rentify",
  robots: { index: false, follow: false },
};

const ROLES = [
  { role: "renter", label: "Renting" },
  { role: "owner", label: "Hosting" },
] as const;

export default async function BookingsPage(props: PageProps<"/bookings">) {
  const query = parseBookingsParams(await props.searchParams);
  const returnTo = bookingsHref(query);
  const user = await requireUser(returnTo);

  let result: BookingsPage | null = null;
  try {
    result = await listMyBookings(user.id, query);
  } catch {
    result = null;
  }
  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / result.pageSize))
    : 1;
  const owner = query.role === "owner";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-fg">Bookings</h1>
          <p className="mt-1 text-muted-foreground">
            Requests you&apos;ve sent and requests for your listings.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/bookings/history">Transaction history</Link>
        </Button>
      </div>

      <nav aria-label="Booking side" className="border-b border-border">
        <ul className="flex gap-1">
          {ROLES.map(({ role, label }) => {
            const current = role === query.role;
            return (
              <li key={role}>
                <Link
                  href={bookingsHref(query, { role, status: null, page: 1 })}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-block border-b-2 px-4 py-2 font-medium",
                    current
                      ? "border-brand-strong text-fg"
                      : "border-transparent text-muted-foreground hover:text-fg",
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Filter by status">
        <ul className="flex flex-wrap gap-2">
          {[null, ...STATUS_FILTERS].map((status) => {
            const current = status === query.status;
            return (
              <li key={status ?? "all"}>
                <Link
                  href={bookingsHref(query, { status, page: 1 })}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-block rounded-full border px-3 py-1 text-sm",
                    current
                      ? "border-brand-strong bg-brand-strong text-white"
                      : "border-border text-fg hover:border-brand-strong",
                  )}
                >
                  {status ? STATUS_LABEL[status] : "All"}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {!result ? (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface-muted p-6"
        >
          <h2 className="text-lg font-semibold text-fg">
            We couldn&apos;t load your bookings
          </h2>
          <p className="mt-1">Please refresh the page in a moment.</p>
        </div>
      ) : result.total === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-fg">
            {query.status
              ? `No ${STATUS_LABEL[query.status].toLowerCase()} bookings`
              : owner
                ? "No requests for your listings yet"
                : "You haven't requested anything yet"}
          </h2>
          <p className="mt-1">
            {owner
              ? "When someone requests one of your devices, it shows up here."
              : "Find a device, choose your dates and send a request."}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={owner ? "/owner/listings" : "/listings"}>
              {owner ? "Go to my listings" : "Browse devices"}
            </Link>
          </Button>
        </div>
      ) : result.bookings.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-fg">
            This page is past your last booking
          </h2>
          <Button asChild variant="outline" className="mt-4">
            <Link href={bookingsHref(query, { page: 1 })}>
              Back to the first page
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? "booking" : "bookings"}
          </p>
          <ul className="flex flex-col gap-4">
            {result.bookings.map((booking) => {
              const status = displayStatus(booking);
              const title = booking.listing?.title ?? "Listing unavailable";
              return (
                <li
                  key={booking.id}
                  className="flex gap-3 rounded-lg border border-border p-3 sm:gap-4 sm:p-4"
                >
                  <div className="aspect-square w-20 shrink-0 self-start overflow-hidden rounded-md bg-surface-muted sm:aspect-[4/3] sm:w-36">
                    {booking.listing?.photoUrl ? (
                      // Photo routes need the session cookie for an owner's
                      // unpublished listing, so no image optimizer.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={booking.listing.photoUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-center text-xs text-muted-foreground">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-fg">
                        <Link
                          href={`/bookings/${booking.id}`}
                          className="hover:text-brand-strong hover:underline"
                        >
                          {title}
                        </Link>
                      </h2>
                      <BookingStatusBadge status={status} />
                    </div>
                    <p className="text-sm">
                      {formatDate(booking.pickup_date)} to{" "}
                      {formatDate(booking.return_date)} · {booking.rental_days}{" "}
                      {booking.rental_days === 1 ? "day" : "days"} ·{" "}
                      <span className="font-semibold text-fg">
                        {formatMoney(booking.total_amount, booking.currency)}
                      </span>
                    </p>
                    {booking.counterpart && (
                      <p className="text-sm text-muted-foreground">
                        {owner ? "Renter" : "Owner"}: {booking.counterpart}
                      </p>
                    )}
                    <p className="text-sm">{statusHint(booking, query.role)}</p>
                    <BookingActions
                      bookingId={booking.id}
                      actions={booking.allowed_actions}
                      returnTo={returnTo}
                    />
                    <Link
                      href={`/bookings/${booking.id}`}
                      className="w-fit text-sm font-medium text-fg underline underline-offset-4 hover:text-brand-strong"
                    >
                      View details<span className="sr-only"> for {title}</span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-between gap-3 border-t border-border pt-4"
            >
              {query.page > 1 ? (
                <Button asChild variant="outline">
                  <Link
                    href={bookingsHref(query, { page: query.page - 1 })}
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
                    href={bookingsHref(query, { page: query.page + 1 })}
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
    </div>
  );
}
