"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getSupabaseEnvironment } from "./env";
import { authCookieOptions } from "@/lib/auth/config";

export function createClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  return createBrowserClient<Database>(url, publishableKey, {
    cookieOptions: authCookieOptions(),
  });
}
