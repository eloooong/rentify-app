import type { BookingAvailability } from "@/lib/bookings/validation";

/*
 * Pure date logic for the booking request panel (A2.1). It follows Person B's
 * booking contract (lib/bookings/README.md) and DECISIONS.md section 2:
 * calendar dates in Asia/Manila; pickup and return are both charged and
 * reserved (20–22 November is 3 days); 1–30 days; blocked ranges are
 * inclusive. The server re-checks everything and its quote is the real one.
 */

export type IsoDate = string; // YYYY-MM-DD

export const MAX_RENTAL_DAYS = 30;
/** The availability endpoint accepts windows of at most 120 days. */
export const AVAILABILITY_WINDOW_DAYS = 120;

const DAY = 86_400_000;
const toUtc = (iso: IsoDate) => Date.parse(`${iso}T00:00:00Z`);
const fromUtc = (ms: number): IsoDate =>
  new Date(ms).toISOString().slice(0, 10);

/** Today's calendar date in Manila. */
export function manilaToday(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(iso) + days * DAY);
}

/** Rental days with both ends counted: 20–22 November is 3. */
export function rentalDays(pickup: IsoDate, returnDate: IsoDate): number {
  return Math.round((toUtc(returnDate) - toUtc(pickup)) / DAY) + 1;
}

export function isBlocked(
  date: IsoDate,
  availability: Pick<BookingAvailability, "blocked_ranges">,
): boolean {
  return availability.blocked_ranges.some(
    (range) => date >= range.from && date <= range.to,
  );
}

/** Whether a date can start a rental. */
export function canPickUp(
  date: IsoDate,
  availability: BookingAvailability,
): boolean {
  return (
    availability.device_available &&
    date >= availability.earliest_pickup_date &&
    date <= availability.latest_pickup_date &&
    !isBlocked(date, availability)
  );
}

/** The first date that can start a rental, or the earliest allowed date. */
export function firstPickup(availability: BookingAvailability): IsoDate {
  for (
    let date = availability.earliest_pickup_date;
    date <= availability.latest_pickup_date;
    date = addDays(date, 1)
  )
    if (canPickUp(date, availability)) return date;
  return availability.earliest_pickup_date;
}

/**
 * The last selectable return date for a pickup: at most 30 days in total and
 * stopping before the next blocked date (a rental can't span a blocked day).
 */
export function latestReturn(
  pickup: IsoDate,
  availability: BookingAvailability,
): IsoDate {
  let last = pickup;
  for (let day = 1; day < MAX_RENTAL_DAYS; day++) {
    const next = addDays(pickup, day);
    if (next > availability.to || isBlocked(next, availability)) break;
    last = next;
  }
  return last;
}

export function canReturn(
  date: IsoDate,
  pickup: IsoDate,
  availability: BookingAvailability,
): boolean {
  return date >= pickup && date <= latestReturn(pickup, availability);
}

export type Selection = { pickup: IsoDate | null; returnDate: IsoDate | null };

/**
 * Applies a click on a day. First click picks up; a valid later click sets
 * the return; clicking before the pickup, or on a pickup-able day once a
 * range is complete, starts again from that day.
 */
export function selectDay(
  current: Selection,
  date: IsoDate,
  availability: BookingAvailability,
): Selection {
  const { pickup, returnDate } = current;
  if (pickup && !returnDate && canReturn(date, pickup, availability))
    return { pickup, returnDate: date };
  if (canPickUp(date, availability)) return { pickup: date, returnDate: null };
  return current;
}

export type QuotePreview = {
  days: number;
  rental: number;
  deposit: number;
  total: number;
};

/** Client-side estimate; the server's quote in the booking response wins. */
export function quotePreview(
  pickup: IsoDate,
  returnDate: IsoDate,
  dailyPrice: number,
  deposit: number,
): QuotePreview {
  const days = rentalDays(pickup, returnDate);
  const rental = days * dailyPrice;
  return { days, rental, deposit, total: rental + deposit };
}

/** A month as weeks of 7 slots (Sunday first); null pads the edges. */
export function monthGrid(year: number, month: number): (IsoDate | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const slots: (IsoDate | null)[] = Array(first.getUTCDay()).fill(null);
  for (let day = 1; day <= daysInMonth; day++)
    slots.push(fromUtc(Date.UTC(year, month, day)));
  while (slots.length % 7) slots.push(null);
  const weeks: (IsoDate | null)[][] = [];
  for (let index = 0; index < slots.length; index += 7)
    weeks.push(slots.slice(index, index + 7));
  return weeks;
}

/** "Sat, 25 Oct 2026" style label for a calendar date. */
export function formatDate(
  iso: IsoDate,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  },
): string {
  return new Intl.DateTimeFormat("en-PH", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(toUtc(iso)));
}

export type BookingProblem = {
  message: string;
  action?: { href: string; label: string };
  /** Availability changed; reload it before trying again. */
  refresh?: boolean;
};

type ErrorBody = { error?: { code?: unknown; message?: unknown } };

/** Turns a booking API error into what the request panel shows. */
export function interpretBookingError(
  status: number,
  body: unknown,
  returnTo: string,
): BookingProblem {
  const error = (body as ErrorBody | null)?.error;
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  switch (code) {
    case "sign_in":
      return {
        message: "Sign in to request this device.",
        action: {
          href: `/login?next=${encodeURIComponent(returnTo)}`,
          label: "Sign in",
        },
      };
    case "profile_required":
      return {
        message: "Complete your profile before requesting a device.",
        action: { href: "/account", label: "Complete your profile" },
      };
    case "self_booking":
      return { message: "You can't request your own listing." };
    case "duplicate_request":
      return {
        message:
          "You already have an open request for these or overlapping dates.",
      };
    case "booking_conflict":
    case "device_unavailable":
    case "unavailable_listing":
      return {
        message:
          "Those dates are no longer available. Choose other dates and try again.",
        refresh: true,
      };
    case "invalid_dates":
      return {
        message:
          message ||
          "Those dates can't be requested. Check the notice and booking window.",
        refresh: true,
      };
    case "retry":
      return { message: "Rentify was busy. Please try again." };
  }
  if (message && status < 500) return { message };
  return {
    message: "We couldn't send your request. Please try again shortly.",
  };
}
