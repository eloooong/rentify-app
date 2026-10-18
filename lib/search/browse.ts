import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { CatalogListing, CatalogPage } from "@/lib/catalog/types";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import type { BrowseQuery, CategoryOption } from "./browse-params";

/*
 * Server-side reads for the browse page.
 *
 * These mirror Person B's public catalog handlers (lib/catalog/handlers.ts:
 * `categories` and `browse`) so the page can render on the server without
 * calling its own API over HTTP. Same rules: an anonymous client (even for a
 * signed-in visitor), published listings only, one currency, the same
 * filters, sort with an ID tie-breaker, and the same photo URL shape. RLS
 * enforces the public projection either way. If B extracts a shared server
 * function from the handler, switch to it and delete this copy.
 */

function publicClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getCategories(): Promise<CategoryOption[]> {
  const { data, error } = await publicClient()
    .from("categories")
    .select("id,slug,name")
    .order("name");
  if (error) throw new Error("Unable to load categories.");
  return data ?? [];
}

export async function searchListings(query: BrowseQuery): Promise<CatalogPage> {
  const client = publicClient();
  let request = client
    .from("listings")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .eq("currency", query.currency);
  if (query.q)
    request = request.ilike("title", `%${query.q.replace(/[\\%_]/g, "\\$&")}%`);
  if (query.categoryId) request = request.eq("category_id", query.categoryId);
  if (query.minPrice !== undefined)
    request = request.gte("daily_price_amount", query.minPrice);
  if (query.maxPrice !== undefined)
    request = request.lte("daily_price_amount", query.maxPrice);
  request =
    query.sort === "newest"
      ? request.order("created_at", { ascending: false })
      : request.order("daily_price_amount", {
          ascending: query.sort === "price_asc",
        });

  const { data, error, count } = await request
    .order("id")
    .range((query.page - 1) * query.pageSize, query.page * query.pageSize - 1);
  if (error) throw new Error("Unable to load listings.");

  const listings = data ?? [];
  let photos: { id: string; listing_id: string; position: number }[] = [];
  if (listings.length) {
    const result = await client
      .from("listing_photos")
      .select("id,listing_id,position")
      .in(
        "listing_id",
        listings.map((listing) => listing.id),
      )
      .order("position");
    if (result.error) throw new Error("Unable to load listing photos.");
    photos = result.data ?? [];
  }

  return {
    data: listings.map((listing): CatalogListing => ({
      ...listing,
      photos: photos
        .filter((photo) => photo.listing_id === listing.id)
        .map((photo) => ({
          id: photo.id,
          position: photo.position,
          url: `/api/catalog/listings/${listing.id}/photos/${photo.id}`,
        })),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: count ?? 0,
    },
  };
}
