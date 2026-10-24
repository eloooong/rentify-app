import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { requireUser } from "@/lib/auth/session";
import type { CheckoutStatus } from "@/lib/payments/validation";
import { formatDate } from "@/lib/listings/booking-dates";
import { getMyBooking, getMyCheckout } from "@/lib/listings/bookings";
import { formatMoney } from "@/lib/listings/format";

export const metadata: Metadata = {
  title: "Checkout | Rentify",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage(
  props: PageProps<"/checkout/[bookingId]">,
) {
  const { bookingId } = await props.params;
  const user = await requireUser(`/checkout/${bookingId}`);
  const booking = await getMyBooking(user.id, bookingId);
  if (!booking) notFound();
  // Only the renter pays; the owner follows the booking from its page.
  if (booking.role !== "renter") redirect(`/bookings/${booking.id}`);

  let checkout: CheckoutStatus | null = null;
  let loadFailed = false;
  try {
    checkout = await getMyCheckout(booking.id);
  } catch {
    loadFailed = true;
  }

  // Once an attempt exists, its stored quote is what PayMongo charges.
  const rent = checkout?.rental_amount ?? booking.rental_amount;
  const deposit = checkout?.deposit_amount ?? booking.deposit_amount;
  const total = checkout?.total_amount ?? booking.total_amount;
  const money = (amount: number) => formatMoney(amount, booking.currency);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href={`/bookings/${booking.id}`}
          className="text-muted-foreground hover:text-brand-strong hover:underline"
        >
          ← Booking
        </Link>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-fg sm:text-3xl">Checkout</h1>
        <p className="mt-1 text-muted-foreground">
          Test mode. No real money moves.
        </p>
      </div>

      <section
        aria-labelledby="summary-heading"
        className="rounded-lg border border-border"
      >
        <h2 id="summary-heading" className="sr-only">
          Order summary
        </h2>
        <div className="border-b border-border p-4">
          <p className="font-semibold text-fg">
            {booking.listing?.title ?? "Listing unavailable"}
          </p>
          <p className="text-sm">
            {formatDate(booking.pickup_date)} to{" "}
            {formatDate(booking.return_date)} · {booking.rental_days}{" "}
            {booking.rental_days === 1 ? "day" : "days"}
          </p>
          {booking.counterpart && (
            <p className="text-sm text-muted-foreground">
              Owner: {booking.counterpart}
            </p>
          )}
        </div>
        <dl className="divide-y divide-border text-sm">
          <div className="flex justify-between gap-4 px-4 py-2">
            <dt className="text-muted-foreground">Rent</dt>
            <dd className="font-medium text-fg">{money(rent)}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2">
            <dt className="text-muted-foreground">Refundable deposit</dt>
            <dd className="font-medium text-fg">{money(deposit)}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2 text-base">
            <dt className="font-semibold text-fg">Total</dt>
            <dd className="font-semibold text-fg">{money(total)}</dd>
          </div>
        </dl>
      </section>

      {loadFailed ? (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface-muted p-4"
        >
          <p className="font-semibold text-fg">
            We couldn&apos;t load the payment status
          </p>
          <p className="mt-1 text-sm">
            Don&apos;t start another payment. Refresh the page in a moment.
          </p>
        </div>
      ) : (
        <CheckoutFlow
          booking={booking}
          total={total}
          initialCheckout={checkout}
        />
      )}
    </div>
  );
}
