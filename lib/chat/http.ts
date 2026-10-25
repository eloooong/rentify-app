import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/catalog/http";
import type { createRouteClient } from "@/lib/supabase/route";

export async function identity(client: ReturnType<typeof createRouteClient>) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at)
    throw new ApiError(401, "sign_in", "Sign in with a verified email.");
}
export function query(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (new Set(params.keys()).size !== Array.from(params).length)
    throw new ApiError(400, "validation", "Send each filter once.");
  return Object.fromEntries(params);
}
export function decoded<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      503,
      "unavailable",
      "The communication response could not be verified.",
    );
  return result.data;
}
export function communicationError(
  error: { code?: string; message?: string } | null,
) {
  if (!error) return;
  if (error.code === "P0001") {
    if (error.message === "not_found")
      throw new ApiError(
        404,
        "not_found",
        "Conversation, message or notification not found.",
      );
    if (error.message === "idempotency_conflict")
      throw new ApiError(
        409,
        "idempotency_conflict",
        "This message key was used with different details.",
      );
    if (error.message === "rate_limited")
      throw new ApiError(
        429,
        "rate_limited",
        "Wait a moment before sending more messages.",
      );
  }
  if (error.code === "42501")
    throw new ApiError(
      403,
      "forbidden",
      "An active verified account is required to send messages.",
    );
  if (error.code?.startsWith("22") || error.code === "23514")
    throw new ApiError(400, "validation", "Check the supplied fields.");
  if (["40P01", "40001", "55P03", "57014"].includes(error.code ?? ""))
    throw new ApiError(
      409,
      "retry",
      "Retry with the same message key and details.",
    );
  throw new ApiError(
    503,
    "unavailable",
    "The communication service is temporarily unavailable.",
  );
}
