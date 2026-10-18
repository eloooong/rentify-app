import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { authCookieOptions } from "@/lib/auth/config";
import type { Database } from "./database.types";
import { getSupabaseEnvironment } from "./env";

export function createRouteClient(
  request: NextRequest,
  response: NextResponse,
) {
  const { url, publishableKey } = getSupabaseEnvironment();
  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });
}
