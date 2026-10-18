import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createRouteClient } from "@/lib/supabase/route";
import { getAppOrigin } from "./config";
import { safeReturnPath } from "./validation";

const confirmationSchema = z.object({
  token_hash: z
    .string()
    .min(16)
    .max(512)
    .regex(/^[a-zA-Z0-9_-]+$/),
  type: z.enum(["email", "recovery"]),
});

export async function handleAuthLink(
  request: NextRequest,
  mode: "confirm" | "callback",
) {
  const origin = getAppOrigin();
  const params = request.nextUrl.searchParams;
  const confirmation = confirmationSchema.safeParse({
    token_hash: params.get("token_hash"),
    type: params.get("type"),
  });
  const destination =
    mode === "confirm"
      ? confirmation.success && confirmation.data.type === "recovery"
        ? "/update-password"
        : "/account"
      : safeReturnPath(params.get("next"));
  const response = NextResponse.redirect(new URL(destination, origin), 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  const fail = () => {
    response.headers.set("Location", new URL("/auth/error", origin).toString());
    return response;
  };
  const code = params.get("code");
  if (mode === "confirm" && !confirmation.success) return fail();
  if (mode === "callback" && (!code || code.length > 2048)) return fail();
  try {
    const client = createRouteClient(request, response);
    const { error } =
      mode === "confirm" && confirmation.success
        ? await client.auth.verifyOtp(confirmation.data)
        : await client.auth.exchangeCodeForSession(code!);
    if (error) return fail();
    return response;
  } catch {
    return fail();
  }
}
