import "server-only";

import { uuidSchema } from "@/lib/catalog/validation";
import type { CatalogListing } from "@/lib/catalog/types";
import { createClient } from "@/lib/supabase/server";
import type { EditorCategory } from "./editor";

/*
 * Server-side reads for the owner's listing editor. Uses the request-scoped,
 * cookie-authenticated client (lib/supabase/server.ts), so RLS returns only
 * the signed-in owner's own rows, drafts included. Writes never happen here:
 * the editor calls Person B's /api/catalog routes from the browser.
 */

export async function getEditorCategories(): Promise<EditorCategory[]> {
  const client = await createClient();
  const { data, error } = await client
    .from("categories")
    .select("id,name,attribute_schema")
    .order("name");
  if (error) throw new Error("Unable to load categories.");
  return (data ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    attributeSchema: category.attribute_schema,
  }));
}

/** Whether the owner has saved a profile; the catalog API requires one. */
export async function hasProfile(userId: string): Promise<boolean> {
  const client = await createClient();
  const { data, error } = await client
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Unable to load your profile.");
  return Boolean(data);
}

export type OwnListing = CatalogListing;

/** The owner's own listing with photo URLs, or null if missing or not theirs. */
export async function getOwnListing(
  id: string,
  userId: string,
): Promise<OwnListing | null> {
  if (!uuidSchema.safeParse(id).success) return null;
  const client = await createClient();
  const listing = await client
    .from("listings")
    .select("*")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (listing.error) throw new Error("Unable to load the listing.");
  if (!listing.data) return null;

  const photos = await client
    .from("listing_photos")
    .select("id,position")
    .eq("listing_id", id)
    .order("position");
  if (photos.error) throw new Error("Unable to load the listing photos.");

  return {
    ...listing.data,
    photos: (photos.data ?? []).map((photo) => ({
      id: photo.id,
      position: photo.position,
      url: `/api/catalog/listings/${id}/photos/${photo.id}`,
    })),
  };
}

export const OWN_PAGE_SIZE = 20;

export type OwnListingsPage = {
  listings: (OwnListing & { hasBookings: boolean })[];
  page: number;
  total: number;
  pageSize: number;
};

/**
 * The owner's listings, newest first (same order as GET /api/catalog/own),
 * with photo URLs and whether each listing has booking history. Booking rows
 * are readable by their owner (bookings_participant_read).
 */
export async function listOwnListings(
  userId: string,
  page = 1,
): Promise<OwnListingsPage> {
  const client = await createClient();
  const from = (page - 1) * OWN_PAGE_SIZE;
  const result = await client
    .from("listings")
    .select("*", { count: "exact" })
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + OWN_PAGE_SIZE - 1);

  // PostgREST answers 416 / PGRST103 for a page past the end (see
  // lib/search/browse.ts); report the real total instead of failing.
  if (result.error?.code === "PGRST103") {
    const total = await client
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);
    if (total.error) throw new Error("Unable to load your listings.");
    return {
      listings: [],
      page,
      total: total.count ?? 0,
      pageSize: OWN_PAGE_SIZE,
    };
  }
  if (result.error) throw new Error("Unable to load your listings.");

  const rows = result.data ?? [];
  const ids = rows.map((row) => row.id);
  const [photos, bookings] = ids.length
    ? await Promise.all([
        client
          .from("listing_photos")
          .select("id,listing_id,position")
          .in("listing_id", ids)
          .order("position"),
        client.from("bookings").select("listing_id").in("listing_id", ids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (photos.error || bookings.error)
    throw new Error("Unable to load your listings.");
  const booked = new Set((bookings.data ?? []).map((row) => row.listing_id));

  return {
    listings: rows.map((row) => ({
      ...row,
      hasBookings: booked.has(row.id),
      photos: (photos.data ?? [])
        .filter((photo) => photo.listing_id === row.id)
        .map((photo) => ({
          id: photo.id,
          position: photo.position,
          url: `/api/catalog/listings/${row.id}/photos/${photo.id}`,
        })),
    })),
    page,
    total: result.count ?? 0,
    pageSize: OWN_PAGE_SIZE,
  };
}
