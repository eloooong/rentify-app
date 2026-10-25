import "server-only";
import {
  bookingId,
  bookingPageSchema,
  bookingSchema,
  type Booking,
} from "@/lib/bookings/validation";
import {
  refundStatus,
  type RefundStatus,
} from "@/lib/payments/refund-validation";
import { checkoutStatus, type CheckoutStatus } from "@/lib/payments/validation";
import { createClient } from "@/lib/supabase/server";
import {
  BOOKINGS_PAGE_SIZE,
  type BookingRole,
  type BookingsQuery,
} from "./booking-status";

/*
 * Server-side reads for the bookings dashboards (A2.2). They call the same
 * authenticated RPCs as Person B's GET /api/bookings handlers
 * (lib/bookings/README.md) with the request's cookie client, and decode the
 * result with B's schemas. Writes go through B's /api/bookings/:id/actions
 * from the browser.
 */

export type BookingListing = {
  title: string;
  photoUrl: string | null;
} | null;

export type DashboardBooking = Booking & {
  role: BookingRole;
  /** Null when the listing is no longer visible to this participant. */
  listing: BookingListing;
  /** The other participant's public display name. */
  counterpart: string | null;
};

export type BookingsPage = {
  bookings: DashboardBooking[];
  page: number;
  pageSize: number;
  total: number;
};

type Client = Awaited<ReturnType<typeof createClient>>;

async function withDetails(
  client: Client,
  userId: string,
  bookings: Booking[],
): Promise<DashboardBooking[]> {
  if (bookings.length === 0) return [];
  const listingIds = [...new Set(bookings.map((b) => b.listing_id))];
  const people = [
    ...new Set(
      bookings.map((b) => (b.owner_id === userId ? b.renter_id : b.owner_id)),
    ),
  ];
  // RLS shows published listings and the owner's own; a renter may no longer
  // see a paused or deleted listing, which then shows as unavailable.
  const [listings, photos, profiles] = await Promise.all([
    client.from("listings").select("id,title").in("id", listingIds),
    client
      .from("listing_photos")
      .select("id,listing_id,position")
      .in("listing_id", listingIds)
      .order("position"),
    client.from("profiles").select("id,display_name").in("id", people),
  ]);
  if (listings.error || photos.error || profiles.error)
    throw new Error("Unable to load booking details.");

  const titles = new Map(listings.data.map((row) => [row.id, row.title]));
  const covers = new Map<string, string>();
  for (const photo of photos.data)
    if (!covers.has(photo.listing_id))
      covers.set(
        photo.listing_id,
        `/api/catalog/listings/${photo.listing_id}/photos/${photo.id}`,
      );
  const names = new Map(profiles.data.map((row) => [row.id, row.display_name]));

  return bookings.map((booking) => {
    const role: BookingRole = booking.owner_id === userId ? "owner" : "renter";
    const title = titles.get(booking.listing_id);
    return {
      ...booking,
      role,
      listing: title
        ? { title, photoUrl: covers.get(booking.listing_id) ?? null }
        : null,
      counterpart:
        names.get(role === "owner" ? booking.renter_id : booking.owner_id) ??
        null,
    };
  });
}

/** The signed-in user's bookings for one side of the dashboard. */
export async function listMyBookings(
  userId: string,
  query: BookingsQuery,
): Promise<BookingsPage> {
  const client = await createClient();
  const { data, error } = await client.rpc("list_my_bookings", {
    p_role: query.role,
    ...(query.status ? { p_status: query.status } : {}),
    p_page: query.page,
    p_page_size: BOOKINGS_PAGE_SIZE,
  });
  if (error) throw new Error("Unable to load your bookings.");
  const page = bookingPageSchema.safeParse(data);
  if (!page.success) throw new Error("Unexpected bookings response.");
  return {
    bookings: await withDetails(client, userId, page.data.data),
    page: page.data.pagination.page,
    pageSize: page.data.pagination.pageSize,
    total: page.data.pagination.total,
  };
}

/** One booking the user takes part in, or null (missing or not theirs). */
export async function getMyBooking(
  userId: string,
  id: string,
): Promise<DashboardBooking | null> {
  if (!bookingId.safeParse(id).success) return null;
  const client = await createClient();
  const { data, error } = await client.rpc("get_booking", { p_booking: id });
  // B's RPC raises "not_found" for outsiders and missing rows alike.
  if (error?.message === "not_found") return null;
  if (error) throw new Error("Unable to load the booking.");
  const booking = bookingSchema.safeParse(data);
  if (!booking.success) throw new Error("Unexpected booking response.");
  const [detailed] = await withDetails(client, userId, [booking.data]);
  return detailed;
}

/**
 * The booking's checkout attempt (one per booking), or null before checkout
 * starts. Uses B's get_checkout RPC, the same call as
 * GET /api/bookings/:id/checkout (lib/payments/README.md).
 */
export async function getMyCheckout(
  id: string,
): Promise<CheckoutStatus | null> {
  const client = await createClient();
  const { data, error } = await client.rpc("get_checkout", { p_booking: id });
  if (error) throw new Error("Unable to load the payment status.");
  const status = checkoutStatus.nullable().safeParse(data);
  if (!status.success) throw new Error("Unexpected payment status response.");
  return status.data;
}

/**
 * The booking's refund status and whether this participant may cancel it
 * as a paid booking now. Uses B's get_booking_refunds RPC, the same call as
 * GET /api/bookings/:id/refunds (lib/payments/REFUNDS.md).
 */
export async function getMyRefunds(id: string): Promise<RefundStatus> {
  const client = await createClient();
  const { data, error } = await client.rpc("get_booking_refunds", {
    p_booking: id,
  });
  if (error) throw new Error("Unable to load the refund status.");
  const status = refundStatus.safeParse(data);
  if (!status.success) throw new Error("Unexpected refund status response.");
  return status.data;
}
