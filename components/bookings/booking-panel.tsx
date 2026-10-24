"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DateRangeCalendar } from "@/components/bookings/date-range-calendar";
import { apiRequest } from "@/components/listings/api-request";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Booking, BookingAvailability } from "@/lib/bookings/validation";
import {
  AVAILABILITY_WINDOW_DAYS,
  addDays,
  formatDate,
  interpretBookingError,
  manilaToday,
  quotePreview,
  selectDay,
  type BookingProblem,
  type IsoDate,
  type Selection,
} from "@/lib/listings/booking-dates";
import { formatMoney } from "@/lib/listings/format";

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; availability: BookingAvailability };

const EMPTY: Selection = { pickup: null, returnDate: null };

function expiryLabel(timestamp: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

/** Availability for today and the next 119 days (the API's maximum). */
async function getAvailability(listingId: string): Promise<Load> {
  const from = manilaToday();
  const params = new URLSearchParams({
    listingId,
    from,
    to: addDays(from, AVAILABILITY_WINDOW_DAYS - 1),
  });
  try {
    const result = await apiRequest(
      "GET",
      `/api/bookings/availability?${params}`,
    );
    if (result.ok && result.json?.data)
      return { state: "ready", availability: result.json.data };
  } catch {
    // Network failure: fall through to the error state.
  }
  return { state: "error" };
}

/**
 * Availability calendar, price estimate and booking request (A2.1), against
 * Person B's booking contract (lib/bookings/README.md). A request reserves
 * nothing; the owner's acceptance does.
 */
export function BookingPanel({
  listingId,
  dailyPrice,
  deposit,
  currency,
  signedIn,
  isOwner,
}: {
  listingId: string;
  dailyPrice: number;
  deposit: number;
  currency: string;
  signedIn: boolean;
  isOwner: boolean;
}) {
  const returnTo = `/listings/${listingId}`;
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selection, setSelection] = useState<Selection>(EMPTY);
  // One key per date choice, reused when the same request is retried.
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<BookingProblem | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  function reloadAvailability() {
    setLoad({ state: "loading" });
    void getAvailability(listingId).then(setLoad);
  }

  useEffect(() => {
    let current = true;
    void getAvailability(listingId).then((next) => current && setLoad(next));
    return () => {
      current = false;
    };
  }, [listingId]);

  function choose(date: IsoDate) {
    if (load.state !== "ready") return;
    const next = selectDay(selection, date, load.availability);
    if (next === selection) return;
    setSelection(next);
    setProblem(null);
    setRequestKey(next.returnDate ? crypto.randomUUID() : null);
  }

  async function sendRequest() {
    const { pickup, returnDate } = selection;
    if (!pickup || !returnDate || !requestKey) return;
    setPending(true);
    setProblem(null);
    try {
      const result = await apiRequest("POST", "/api/bookings", {
        listing_id: listingId,
        pickup_date: pickup,
        return_date: returnDate,
        request_key: requestKey,
      });
      if (result.ok && result.json?.data) {
        setBooking(result.json.data);
        return;
      }
      const next = interpretBookingError(result.status, result.json, returnTo);
      setProblem(next);
      if (next.refresh) {
        setSelection(EMPTY);
        setRequestKey(null);
        reloadAvailability();
      }
    } catch {
      setProblem(interpretBookingError(0, null, returnTo));
    } finally {
      setPending(false);
    }
  }

  if (booking) {
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-md bg-surface-tint p-4 text-sm"
      >
        <p className="text-base font-semibold text-fg">Request sent</p>
        <p>
          {formatDate(booking.pickup_date)} to {formatDate(booking.return_date)}{" "}
          · {booking.rental_days} {booking.rental_days === 1 ? "day" : "days"}
        </p>
        <p>
          Total{" "}
          <span className="font-semibold text-fg">
            {formatMoney(booking.total_amount, booking.currency)}
          </span>{" "}
          ({formatMoney(booking.rental_amount, booking.currency)} rental +{" "}
          {formatMoney(booking.deposit_amount, booking.currency)} deposit)
        </p>
        {booking.request_expires_at && (
          <p>
            The owner has until {expiryLabel(booking.request_expires_at)}{" "}
            (Manila time) to respond. Nothing is reserved or charged until they
            accept.
          </p>
        )}
        <Link
          href={`/bookings/${booking.id}`}
          className="w-fit font-medium text-brand-strong underline underline-offset-2"
        >
          View your request
        </Link>
      </div>
    );
  }

  if (load.state === "loading")
    return (
      <p role="status" className="rounded-md bg-surface-muted p-3 text-sm">
        Loading availability…
      </p>
    );

  if (load.state === "error")
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-2 rounded-md bg-surface-muted p-3 text-sm"
      >
        <p>We couldn&apos;t load availability.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reloadAvailability}
        >
          Try again
        </Button>
      </div>
    );

  const { availability } = load;
  if (!availability.device_available)
    return (
      <p className="rounded-md bg-surface-muted p-3 text-sm">
        This device isn&apos;t available to book right now.
      </p>
    );

  const { pickup, returnDate } = selection;
  const quote =
    pickup && returnDate
      ? quotePreview(pickup, returnDate, dailyPrice, deposit)
      : null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg">Choose your dates</h3>
      <p id="calendar-help" className="text-xs text-muted-foreground">
        Pick a pickup day, then a return day. Both days count. Requests need at
        least 24 hours&apos; notice, for up to 30 days.
      </p>
      <DateRangeCalendar
        availability={availability}
        selection={selection}
        onSelect={choose}
      />

      <div role="status" className="rounded-md bg-surface-muted p-3 text-sm">
        {!pickup && <p>No dates selected.</p>}
        {pickup && !returnDate && (
          <p>Pickup {formatDate(pickup)}. Now choose a return day.</p>
        )}
        {quote && (
          <dl className="flex flex-col gap-1">
            <div className="flex justify-between gap-4">
              <dt>
                {formatDate(pickup!)} to {formatDate(returnDate!)}
              </dt>
              <dd>
                {quote.days} {quote.days === 1 ? "day" : "days"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>
                {formatMoney(dailyPrice, currency)} × {quote.days}
              </dt>
              <dd>{formatMoney(quote.rental, currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Refundable deposit</dt>
              <dd>{formatMoney(quote.deposit, currency)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-1 font-semibold text-fg">
              <dt>Estimated total</dt>
              <dd>{formatMoney(quote.total, currency)}</dd>
            </div>
          </dl>
        )}
      </div>

      {problem && (
        <div role="alert" className="text-sm text-destructive">
          <p>{problem.message}</p>
          {problem.action && (
            <Link
              href={problem.action.href}
              className="font-medium underline underline-offset-2"
            >
              {problem.action.label}
            </Link>
          )}
        </div>
      )}

      {isOwner ? (
        <p className="text-sm text-muted-foreground">
          This is your listing.{" "}
          <Link
            href={`/owner/listings/${listingId}/edit`}
            className="font-medium text-brand-strong underline underline-offset-2"
          >
            Edit it
          </Link>
        </p>
      ) : signedIn ? (
        <Button
          type="button"
          className="w-full"
          disabled={!quote || pending}
          onClick={() => void sendRequest()}
        >
          {pending ? "Sending request…" : "Request to book"}
        </Button>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(returnTo)}`}
          className={buttonVariants({ className: "w-full" })}
        >
          Sign in to request
        </Link>
      )}
      {!isOwner && (
        <p className="text-xs text-muted-foreground">
          You won&apos;t be charged yet. The owner reviews your request first.
        </p>
      )}
    </div>
  );
}
