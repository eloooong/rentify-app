import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import type { createRouteClient } from "@/lib/supabase/route";
import { api, ApiError, databaseError, jsonBody, limitedBody } from "./http";
import { IMAGE_BUCKET, MAX_IMAGE_BYTES, normalizeImage } from "./images";
import {
  attributesSchema,
  listingSchema,
  ownQuerySchema,
  querySchema,
  updateListingSchema,
  uuidSchema,
} from "./validation";

type Client = ReturnType<typeof createRouteClient>;
type Listing = Database["public"]["Tables"]["listings"]["Row"];
function publicClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function identity(client: Client, editable = false) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at)
    throw new ApiError(401, "sign_in", "Sign in with a verified email.");
  if (editable) {
    const allowed = await client.rpc("can_edit_own_profile");
    databaseError(allowed.error);
    const profile = await client
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    databaseError(profile.error);
    if (!allowed.data || !profile.data)
      throw new ApiError(
        403,
        "profile_required",
        "Complete your profile; a verified active account is required.",
      );
  }
  return user;
}
async function withPhotos(client: Client, listings: Listing[]) {
  if (!listings.length) return [];
  const photos = await client
    .from("listing_photos")
    .select("id,listing_id,position")
    .in(
      "listing_id",
      listings.map((listing) => listing.id),
    )
    .order("position");
  databaseError(photos.error);
  return listings.map((listing) => ({
    ...listing,
    photos: (photos.data ?? [])
      .filter((photo) => photo.listing_id === listing.id)
      .map((photo) => ({
        id: photo.id,
        position: photo.position,
        url: `/api/catalog/listings/${listing.id}/photos/${photo.id}`,
      })),
  }));
}
async function validateCategory(
  client: Client,
  categoryId: string,
  attributes: unknown,
) {
  const { data, error } = await client
    .from("categories")
    .select("attribute_schema")
    .eq("id", categoryId)
    .maybeSingle();
  databaseError(error);
  if (!data)
    throw new ApiError(400, "category", "Choose an existing category.");
  attributesSchema(data.attribute_schema).parse(attributes);
}
async function ownedListing(client: Client, id: string) {
  const user = await identity(client, true);
  const { data, error } = await client
    .from("listings")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  databaseError(error);
  if (!data) throw new ApiError(404, "not_found", "Listing not found.");
  if (data.status === "hidden")
    throw new ApiError(403, "moderated", "This listing is restricted.");
  return data;
}

export function categories(request: NextRequest) {
  return api(request, async () => {
    const { data, error } = await publicClient()
      .from("categories")
      .select("id,name,slug,parent_id,attribute_schema")
      .order("name");
    databaseError(error);
    return NextResponse.json({ data });
  });
}
export function browse(request: NextRequest) {
  return api(request, async () => {
    const input = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const client = publicClient();
    let query = client
      .from("listings")
      .select("*", { count: "exact" })
      .eq("status", "published")
      .eq("currency", input.currency);
    if (input.q)
      query = query.ilike("title", `%${input.q.replace(/[\\%_]/g, "\\$&")}%`);
    if (input.categoryId) query = query.eq("category_id", input.categoryId);
    if (input.minPrice !== undefined)
      query = query.gte("daily_price_amount", input.minPrice);
    if (input.maxPrice !== undefined)
      query = query.lte("daily_price_amount", input.maxPrice);
    query =
      input.sort === "newest"
        ? query.order("created_at", { ascending: false })
        : query.order("daily_price_amount", {
            ascending: input.sort === "price_asc",
          });
    const { data, error, count } = await query
      .order("id")
      .range(
        (input.page - 1) * input.pageSize,
        input.page * input.pageSize - 1,
      );
    databaseError(error);
    return NextResponse.json({
      data: await withPhotos(client, data ?? []),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count ?? 0,
      },
    });
  });
}
export function own(request: NextRequest) {
  return api(request, async (client) => {
    const user = await identity(client);
    const input = ownQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    let query = client
      .from("listings")
      .select("*", { count: "exact" })
      .eq("owner_id", user.id);
    if (input.id) query = query.eq("id", input.id);
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("id")
      .range(
        (input.page - 1) * input.pageSize,
        input.page * input.pageSize - 1,
      );
    databaseError(error);
    return NextResponse.json({
      data: await withPhotos(client, data ?? []),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count ?? 0,
      },
    });
  });
}
export function detail(request: NextRequest, id: string) {
  return api(request, async () => {
    uuidSchema.parse(id);
    const client = publicClient();
    const { data, error } = await client
      .from("listings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    databaseError(error);
    if (!data) throw new ApiError(404, "not_found", "Listing not found.");
    return NextResponse.json({ data: (await withPhotos(client, [data]))[0] });
  });
}
export function createListing(request: NextRequest) {
  return api(request, async (client) => {
    const user = await identity(client, true);
    const input = listingSchema.parse(await jsonBody(request));
    await validateCategory(client, input.category_id, input.attributes);
    const { data, error } = await client
      .from("listings")
      .insert({ ...input, owner_id: user.id, status: "draft" })
      .select("*")
      .single();
    databaseError(error);
    return NextResponse.json({ data }, { status: 201 });
  });
}
export function updateListing(request: NextRequest, id: string) {
  return api(request, async (client) => {
    uuidSchema.parse(id);
    const listing = await ownedListing(client, id);
    const input = updateListingSchema.parse(await jsonBody(request));
    await validateCategory(client, input.category_id, input.attributes);
    const { data, error } = await client
      .from("listings")
      .update(input)
      .eq("id", id)
      .eq("owner_id", listing.owner_id)
      .select("*")
      .maybeSingle();
    databaseError(error);
    if (!data)
      throw new ApiError(403, "forbidden", "This listing cannot be changed.");
    return NextResponse.json({ data });
  });
}
export function deleteListing(request: NextRequest, id: string) {
  return api(request, async (client) => {
    uuidSchema.parse(id);
    const listing = await ownedListing(client, id);
    if (listing.status !== "draft")
      throw new ApiError(
        409,
        "draft_required",
        "Return the listing to draft before deleting it.",
      );
    const { data, error } = await client
      .from("listings")
      .delete()
      .eq("id", id)
      .eq("owner_id", listing.owner_id)
      .select("id");
    databaseError(error);
    if (!data?.length)
      throw new ApiError(403, "forbidden", "This listing cannot be deleted.");
    return NextResponse.json({ data: { deleted: true } });
  });
}
export function uploadPhoto(request: NextRequest, id: string) {
  return api(request, async (client) => {
    uuidSchema.parse(id);
    const listing = await ownedListing(client, id);
    if (
      !request.headers.get("content-type")?.startsWith("multipart/form-data;")
    )
      throw new ApiError(
        415,
        "content_type",
        "Send a multipart image and position.",
      );
    const bytes = await limitedBody(request, MAX_IMAGE_BYTES + 65536);
    let form: FormData;
    try {
      form = await new Response(bytes, {
        headers: { "Content-Type": request.headers.get("content-type")! },
      }).formData();
    } catch {
      throw new ApiError(400, "multipart", "Send valid multipart form data.");
    }
    const file = form.get("file");
    const position = z
      .string()
      .regex(/^[0-7]$/)
      .transform(Number)
      .parse(form.get("position"));
    if (
      !(file instanceof File) ||
      form.getAll("file").length !== 1 ||
      form.getAll("position").length !== 1
    )
      throw new ApiError(400, "file", "Send one file and one position.");
    if (file.size > MAX_IMAGE_BYTES)
      throw new ApiError(413, "too_large", "Images must be 4 MiB or smaller.");
    let image: Buffer;
    try {
      image = await normalizeImage(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new ApiError(
        415,
        "image",
        "Use a valid, static JPEG, PNG, or WebP image up to 40 megapixels.",
      );
    }
    const path = `${listing.owner_id}/${id}/${randomUUID()}.webp`;
    const uploaded = await client.storage
      .from(IMAGE_BUCKET)
      .upload(path, image, { contentType: "image/webp", upsert: false });
    if (uploaded.error)
      throw new ApiError(
        503,
        "upload",
        "The image could not be uploaded. Please retry.",
      );
    const { data, error } = await client
      .from("listing_photos")
      .insert({ listing_id: id, storage_path: path, position })
      .select("id,position")
      .single();
    if (error) {
      await client.storage.from(IMAGE_BUCKET).remove([path]);
      databaseError(error);
    }
    return NextResponse.json(
      {
        data: {
          ...data,
          url: `/api/catalog/listings/${id}/photos/${data!.id}`,
        },
      },
      { status: 201 },
    );
  });
}
export function getPhoto(request: NextRequest, id: string, photoId: string) {
  return api(request, async (client) => {
    uuidSchema.parse(id);
    uuidSchema.parse(photoId);
    const { data, error } = await client
      .from("listing_photos")
      .select("storage_path")
      .eq("id", photoId)
      .eq("listing_id", id)
      .maybeSingle();
    databaseError(error);
    if (!data) throw new ApiError(404, "not_found", "Photo not found.");
    const file = await client.storage
      .from(IMAGE_BUCKET)
      .download(data.storage_path);
    if (file.error || !file.data)
      throw new ApiError(404, "not_found", "Photo not found.");
    // Also decode reads: bytes uploaded directly through Storage are untrusted.
    let image: Buffer;
    try {
      image = await normalizeImage(
        new Uint8Array(await file.data.arrayBuffer()),
      );
    } catch {
      throw new ApiError(404, "not_found", "Photo not found.");
    }
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": "inline; filename=listing-photo.webp",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
}
export function deletePhoto(request: NextRequest, id: string, photoId: string) {
  return api(request, async (client) => {
    uuidSchema.parse(id);
    uuidSchema.parse(photoId);
    await ownedListing(client, id);
    const { data, error } = await client
      .from("listing_photos")
      .delete()
      .eq("id", photoId)
      .eq("listing_id", id)
      .select("storage_path")
      .maybeSingle();
    databaseError(error);
    if (!data) throw new ApiError(404, "not_found", "Photo not found.");
    const removed = await client.storage
      .from(IMAGE_BUCKET)
      .remove([data.storage_path]);
    return NextResponse.json({
      data: {
        deleted: true,
        storageCleanupPending: !!removed.error,
        ...(removed.error ? { storagePath: data.storage_path } : {}),
      },
    });
  });
}
