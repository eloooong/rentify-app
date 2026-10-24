import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { BookingActions } from "@/components/bookings/booking-actions";
import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/listings/booking-dates";
import {
  bookingsHref,
  displayStatus,
  formatManilaTime,
  statusHint,
} from "@/lib/listings/booking-status";
import { getMyBooking } from "@/lib/listings/bookings";
import { formatMoney } from "@/lib/listings/format";

export const metadata: Metadata = {
  title: "Booking | Rentify",
  robots: { index: false, follow: false },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-fg">{children}</dd>
    </div>
  );
}

export default async function BookingDetailPage(
  props: PageProps<"/bookings/[id]">,
) {
  const { id } = await props.params;
  const returnTo = `/bookings/${id}`;
  const user = await requireUser(returnTo);
  const booking = await getMyBooking(user.id, id);
  if (!booking) notFound();

  const status = displayStatus(booking);
  const owner = booking.role === "owner";
  const title = booking.listing?.title ?? "Listing unavailable";
  const money = (amount: number) => formatMoney(amount, booking.currency);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href={bookingsHref({
            role: booking.role,
            status: null,
            page: 1,
          })}
          className="text-muted-foreground hover:text-brand-strong hover:underline"
        >
          ← {owner ? "Hosting" : "Renting"}
        </Link>
      </nav>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-fg sm:text-3xl">
            {title}
          </h1>
          <BookingStatusBadge status={status} />
        </div>
        {booking.listing ? (
          <Link
            href={`/listings/${booking.listing_id}`}
            className="w-fit text-sm font-medium text-fg underline underline-offset-4 hover:text-brand-strong"
          >
            View listing
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            This listing is no longer public.
          </p>
        )}
      </div>

      <section
        aria-labelledby="next-heading"
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
        <h2 id="next-heading" className="text-lg font-semibold text-fg">
          Where it stands
        </h2>
        <p>{statusHint(booking, booking.role)}</p>
        {booking.status_reason && (
          <p className="text-sm">
            <span className="text-muted-foreground">Reason: </span>
            {booking.status_reason}
          </p>
        )}
        {status === "accepted" && !owner && (
          <p className="rounded-md bg-surface-muted p-3 text-sm">
            Online checkout isn&apos;t available yet. It opens in a later
            release.
          </p>
        )}
        <BookingActions
          bookingId={booking.id}
          actions={booking.allowed_actions}
          returnTo={returnTo}
        />
      </section>

      <section aria-labelledby="details-heading">
        <h2 id="details-heading" className="text-lg font-semibold text-fg">
          Details
        </h2>
        <dl className="mt-2 divide-y divide-border rounded-lg border border-border">
          <Row label="Pickup">{formatDate(booking.pickup_date)}</Row>
          <Row label="Return">{formatDate(booking.return_date)}</Row>
          <Row label="Rental days">{booking.rental_days}</Row>
          {booking.counterpart && (
            <Row label={owner ? "Renter" : "Owner"}>{booking.counterpart}</Row>
          )}
          <Row label="Requested">{formatManilaTime(booking.created_at)}</Row>
          {booking.request_expires_at && booking.status === "requested" && (
            <Row label="Response due">
              {formatManilaTime(booking.request_expires_at)}
            </Row>
          )}
          {booking.accepted_at && (
            <Row label="Accepted">{formatManilaTime(booking.accepted_at)}</Row>
          )}
          {booking.payment_expires_at && booking.status === "accepted" && (
            <Row label="Payment due">
              {formatManilaTime(booking.payment_expires_at)}
            </Row>
          )}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Times are in Manila time.
        </p>
      </section>

      <section aria-labelledby="price-heading">
        <h2 id="price-heading" className="text-lg font-semibold text-fg">
          Price
        </h2>
        <dl className="mt-2 divide-y divide-border rounded-lg border border-border">
          {booking.daily_price_amount !== null && (
            <Row
              label={`${money(booking.daily_price_amount)} × ${booking.rental_days}`}
            >
              {money(booking.rental_amount)}
            </Row>
          )}
          <Row label="Refundable deposit">{money(booking.deposit_amount)}</Row>
          <Row label="Total">{money(booking.total_amount)}</Row>
        </dl>
      </section>
    </div>
  );
}
