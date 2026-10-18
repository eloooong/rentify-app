import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type SignedInUser = { id: string; email: string | null };

/**
 * The verified user for the header, or null when signed out.
 *
 * Reading cookies first keeps every page that renders the header dynamic, so
 * a signed-out header is never baked into a static build. Missing Supabase
 * configuration or a provider outage shows the signed-out header instead of
 * breaking the page; protected pages still enforce sign-in themselves.
 * Uses getUser() (verified with the auth server), never getSession().
 */
export async function getSignedInUser(): Promise<SignedInUser | null> {
  await cookies();
  try {
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    // Same rule as lib/auth/session.ts: an unverified email is not signed in.
    if (error || !user?.email_confirmed_at) return null;
    return { id: user.id, email: user.email ?? null };
  } catch {
    return null;
  }
}
