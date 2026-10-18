import "server-only";

import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { uuidSchema } from "@/lib/catalog/validation";
import type { CatalogListing } from "@/lib/catalog/types";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export type ListingOwner = {
  id: string;
  displayName: string;
  memberSince: string;
};

export type ListingCategory = {
  name: string;
  slug: string;
  attributeSchema: unknown;
};

export type PublicListing = CatalogListing & {
  category: ListingCategory | null;
  owner: ListingOwner | null;
};

/*
 * Server-side read for the public detail page. Mirrors Person B's `detail`
 * handler in lib/catalog/handlers.ts: an anonymous client (even for a
 * signed-in visitor), so RLS returns only published listings from active
 * owners, plus the same photo URL shape. An explicit status filter is added as
 * a second guard. The owner uses the public profile projection from
 * lib/profiles/README.md and never private fields.
 */

function publicClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * The public listing, or null when it is missing, not published, hidden, or
 * its owner is suspended. Throws on a provider failure. Cached per request so
 * generateMetadata and the page share one fetch.
 */
export const getPublicListing = cache(
  async (id: string): Promise<PublicListing | null> => {
    if (!uuidSchema.safeParse(id).success) return null;
    const client = publicClient();

    const listing = await client
      .from("listings")
      .select("*")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
    if (listing.error) throw new Error("Unable to load the listing.");
    if (!listing.data) return null;

    const [photos, category, owner] = await Promise.all([
      client
        .from("listing_photos")
        .select("id,position")
        .eq("listing_id", id)
        .order("position"),
      client
        .from("categories")
        .select("name,slug,attribute_schema")
        .eq("id", listing.data.category_id)
        .maybeSingle(),
      client
        .from("profiles")
        .select("id,display_name,created_at")
        .eq("id", listing.data.owner_id)
        .maybeSingle(),
    ]);
    if (photos.error || category.error || owner.error)
      throw new Error("Unable to load the listing.");

    return {
      ...listing.data,
      photos: (photos.data ?? []).map((photo) => ({
        id: photo.id,
        position: photo.position,
        url: `/api/catalog/listings/${id}/photos/${photo.id}`,
      })),
      category: category.data
        ? {
            name: category.data.name,
            slug: category.data.slug,
            attributeSchema: category.data.attribute_schema,
          }
        : null,
      owner: owner.data
        ? {
            id: owner.data.id,
            displayName: owner.data.display_name,
            memberSince: owner.data.created_at,
          }
        : null,
    };
  },
);
