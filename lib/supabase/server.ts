import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getSupabaseEnvironment } from "./env";

/** Read-only Server Component client. Create once per request, never globally. */
export async function createClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Server Components cannot persist cookies. B1.1 must add the refresh
      // proxy and writable auth clients before session-dependent integration.
      setAll() {},
    },
  });
}
