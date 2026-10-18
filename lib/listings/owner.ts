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
