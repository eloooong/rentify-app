import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

type Client = SupabaseClient<Database>;

/**
 * PostgREST answers HTTP 416 with this code when the requested page starts
 * beyond the last matching row (for example ?page=99 with four listings),
 * instead of returning an empty list.
 */
export const RANGE_NOT_SATISFIABLE = "PGRST103";

/** The subset of the query builder that the browse filters use. */
interface Filterable<Self> {
  eq(column: string, value: string): Self;
  ilike(column: string, pattern: string): Self;
  gte(column: string, value: number): Self;
  lte(column: string, value: number): Self;
}

/** Filters shared by the page query and the count-only fallback. */
function applyFilters<Q extends Filterable<Q>>(request: Q, query: BrowseQuery) {
  let filtered = request
    .eq("status", "published")
    .eq("currency", query.currency);
  if (query.q)
    filtered = filtered.ilike(
      "title",
      `%${query.q.replace(/[\\%_]/g, "\\$&")}%`,
    );
  if (query.categoryId) filtered = filtered.eq("category_id", query.categoryId);
  if (query.minPrice !== undefined)
    filtered = filtered.gte("daily_price_amount", query.minPrice);
  if (query.maxPrice !== undefined)
    filtered = filtered.lte("daily_price_amount", query.maxPrice);
  return filtered;
}

export async function searchListings(
  query: BrowseQuery,
  client: Client = publicClient(),
): Promise<CatalogPage> {
  let request = applyFilters(
    client.from("listings").select("*", { count: "exact" }),
    query,
  );
  request =
    query.sort === "newest"
      ? request.order("created_at", { ascending: false })
      : request.order("daily_price_amount", {
          ascending: query.sort === "price_asc",
        });

  const { data, error, count } = await request
    .order("id")
    .range((query.page - 1) * query.pageSize, query.page * query.pageSize - 1);

  if (error?.code === RANGE_NOT_SATISFIABLE) {
    // Past the last result: report the real total so the page can show its
    // "past the last result" state instead of a load failure.
    const total = await applyFilters(
      client.from("listings").select("id", { count: "exact", head: true }),
      query,
    );
    if (total.error) throw new Error("Unable to load listings.");
    return {
      data: [],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: total.count ?? 0,
      },
    };
  }
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
