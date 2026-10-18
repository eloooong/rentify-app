import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { createRouteClient } from "@/lib/supabase/route";
import { api, ApiError, jsonBody } from "@/lib/catalog/http";
import { bookingError } from "./errors";
import {
  actionSchema,
  availabilityQuerySchema,
  availabilitySchema,
  bookingId,
  bookingPageSchema,
  bookingSchema,
  listSchema,
  requestSchema,
} from "./validation";

type Client = ReturnType<typeof createRouteClient>;
async function identity(client: Client) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at)
    throw new ApiError(401, "sign_in", "Sign in with a verified email.");
}
function decoded<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      503,
      "unavailable",
      "The booking service returned an unexpected response.",
    );
  return result.data;
}

export function createBooking(request: NextRequest) {
  return api(request, async (client) => {
    await identity(client);
    const input = requestSchema.parse(await jsonBody(request));
    const { data, error } = await client.rpc("request_booking", {
      p_listing: input.listing_id,
      p_pickup: input.pickup_date,
      p_return: input.return_date,
      p_request_key: input.request_key,
    });
    bookingError(error);
    const result = decoded(
      z.object({ booking: bookingSchema, replayed: z.boolean() }).strict(),
      data,
    );
    return NextResponse.json(
      { data: result.booking, replayed: result.replayed },
      { status: result.replayed ? 200 : 201 },
    );
  });
}
export function bookingList(request: NextRequest) {
  return api(request, async (client) => {
    await identity(client);
    const input = listSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const { data, error } = await client.rpc("list_my_bookings", {
      p_role: input.role,
      ...(input.status ? { p_status: input.status } : {}),
      p_page: input.page,
      p_page_size: input.pageSize,
    });
    bookingError(error);
    return NextResponse.json(decoded(bookingPageSchema, data));
  });
}
export function bookingDetail(request: NextRequest, id: string) {
  return api(request, async (client) => {
    await identity(client);
    bookingId.parse(id);
    const { data, error } = await client.rpc("get_booking", { p_booking: id });
    bookingError(error);
    return NextResponse.json({ data: decoded(bookingSchema, data) });
  });
}
export function bookingAction(request: NextRequest, id: string) {
  return api(request, async (client) => {
    await identity(client);
    bookingId.parse(id);
    const input = actionSchema.parse(await jsonBody(request));
    const { data, error } = await client.rpc("act_on_booking", {
      p_booking: id,
      p_action: input.action,
      ...(input.action !== "accept" ? { p_reason: input.reason } : {}),
    });
    bookingError(error);
    return NextResponse.json({ data: decoded(bookingSchema, data) });
  });
}
export function availability(request: NextRequest) {
  return api(request, async (client) => {
    const input = availabilityQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const { data, error } = await client.rpc("booking_availability", {
      p_listing: input.listingId,
      p_from: input.from,
      p_to: input.to,
    });
    bookingError(error);
    return NextResponse.json({ data: decoded(availabilitySchema, data) });
  });
}
