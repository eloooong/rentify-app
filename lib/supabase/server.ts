import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getSupabaseEnvironment } from "./env";
import { authCookieOptions } from "@/lib/auth/config";

/** Read-only Server Component client. Create once per request, never globally. */
export async function createClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      // The request proxy persists refreshed cookies before component rendering.
      setAll() {},
    },
  });
}
