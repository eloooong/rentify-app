import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppOrigin } from "@/lib/auth/config";
import { createRouteClient } from "@/lib/supabase/route";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function limitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApiError(400, "invalid_body", "A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, "too_large", "The request is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function jsonBody(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new ApiError(415, "content_type", "Send application/json.");
  const body = await limitedBody(request, 32768);
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "invalid_json", "Send valid JSON.");
  }
}
export function databaseError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501")
    throw new ApiError(
      403,
      "forbidden",
      "This account cannot perform that action.",
    );
  if (error.code === "23505")
    throw new ApiError(
      409,
      "conflict",
      "That photo position is already in use.",
    );
  if (error.code === "23503")
    throw new ApiError(
      409,
      "dependencies",
      "Remove photos and remaining uploads first. Listings referenced by bookings cannot be deleted.",
    );
  if (error.code === "23514")
    throw new ApiError(
      400,
      "invalid_listing",
      "Check the listing fields and category attributes. Publishing needs a photo; pause before removing the last photo.",
    );
  throw new ApiError(
    503,
    "unavailable",
    "The service is temporarily unavailable.",
  );
}
export async function api(
  request: NextRequest,
  run: (client: ReturnType<typeof createRouteClient>) => Promise<NextResponse>,
) {
  const sessionResponse = new NextResponse();
  let response: NextResponse;
  try {
    if (
      !["GET", "HEAD"].includes(request.method) &&
      request.headers.get("origin") !== getAppOrigin()
    )
      throw new ApiError(403, "origin", "Use the Rentify app to make changes.");
    response = await run(createRouteClient(request, sessionResponse));
  } catch (error) {
    response =
      error instanceof z.ZodError
        ? NextResponse.json(
            {
              error: {
                code: "validation",
                message: "Check the supplied fields.",
                fields: z.flattenError(error).fieldErrors,
              },
            },
            { status: 400 },
          )
        : error instanceof ApiError
          ? NextResponse.json(
              { error: { code: error.code, message: error.message } },
              { status: error.status },
            )
          : NextResponse.json(
              {
                error: {
                  code: "unavailable",
                  message: "The service is temporarily unavailable.",
                },
              },
              { status: 503 },
            );
  }
  sessionResponse.cookies
    .getAll()
    .forEach((cookie) => response.cookies.set(cookie));
  sessionResponse.headers.forEach((value, name) => {
    if (name !== "set-cookie") response.headers.set(name, value);
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
