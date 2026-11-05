import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api, ApiError, jsonBody } from "@/lib/catalog/http";
import type { createRouteClient } from "@/lib/supabase/route";
import {
  reviewEligibility,
  reviewId,
  reviewInput,
  reviewPage,
  reviewQuery,
  submittedReview,
} from "./validation";

function query(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (new Set(params.keys()).size !== Array.from(params).length)
    throw new ApiError(400, "validation", "Send each filter once.");
  return Object.fromEntries(params);
}
async function identity(client: ReturnType<typeof createRouteClient>) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at)
    throw new ApiError(401, "sign_in", "Sign in with a verified email.");
}
function decoded<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ApiError(
      503,
      "unavailable",
      "The review response could not be verified.",
    );
  return parsed.data;
}
function reviewError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "P0001") {
    if (error.message === "not_found")
      throw new ApiError(404, "not_found", "Booking not found.");
    if (error.message === "review_not_allowed")
      throw new ApiError(
        409,
        "review_not_allowed",
        "Reviews require a completed rental.",
      );
    if (error.message === "review_exists")
      throw new ApiError(
        409,
        "review_exists",
        "Your review is already published and cannot be changed.",
      );
  }
  if (error.code === "42501")
    throw new ApiError(
      403,
      "forbidden",
      "An active verified account with a profile is required to submit a review.",
    );
  if (error.code?.startsWith("22") || error.code === "23514")
    throw new ApiError(400, "validation", "Check the review fields.");
  if (["40P01", "40001", "55P03", "57014"].includes(error.code ?? ""))
    throw new ApiError(409, "retry", "Retry the same rating and comment.");
  throw new ApiError(
    503,
    "unavailable",
    "Reviews are temporarily unavailable.",
  );
}
export function bookingReview(request: NextRequest, booking: string) {
  return api(request, async (client) => {
    await identity(client);
    reviewId.parse(booking);
    z.object({}).strict().parse(query(request));
    const result = await client.rpc("get_booking_review", {
      p_booking: booking,
    });
    reviewError(result.error);
    return NextResponse.json(decoded(reviewEligibility, result.data));
  });
}
export function submitReview(request: NextRequest, booking: string) {
  return api(request, async (client) => {
    await identity(client);
    reviewId.parse(booking);
    z.object({}).strict().parse(query(request));
    const input = reviewInput.parse(await jsonBody(request));
    const result = await client.rpc("submit_booking_review", {
      p_booking: booking,
      p_rating: input.rating,
      p_comment: input.comment,
    });
    reviewError(result.error);
    const value = decoded(submittedReview, result.data);
    return NextResponse.json(value, { status: value.replayed ? 200 : 201 });
  });
}
export function profileReviews(request: NextRequest, subject: string) {
  return api(request, async (client) => {
    reviewId.parse(subject);
    const input = reviewQuery.parse(query(request));
    const result = await client.rpc("list_profile_reviews", {
      p_subject: subject,
      p_page: input.page,
      p_page_size: input.pageSize,
      ...(input.role ? { p_role: input.role } : {}),
    });
    reviewError(result.error);
    return NextResponse.json(decoded(reviewPage, result.data));
  });
}
