import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions } from "@/lib/auth/config";
import type { Database } from "./database.types";
import { getSupabaseEnvironment } from "./env";

/** Writable cookies for Server Actions. Auth routes also enforce no-store in proxy. */
export async function createActionClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        values.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    },
  });
}
