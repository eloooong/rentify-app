import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { reviewId, reviewPage } from "@/lib/reviews/validation";
import type { z } from "zod";
import {
  REVIEWS_PAGE_SIZE,
  type RatingSummary,
  type ReviewRole,
  type ReviewsView,
} from "./reviews";

/*
 * Server-side reads for public rating displays (A3.3). They call the same
 * public RPC as Person B's GET /api/profiles/:id/reviews handler
 * (lib/reviews/README.md) with an anonymous client, so a signed-in visitor sees
 * exactly what everyone sees, and decode the result with B's schema.
 */

export type ReviewPage = z.infer<typeof reviewPage>;

function publicClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** One page of a profile's public reviews. Throws on a provider failure. */
export async function getProfileReviews(
  profileId: string,
  view: ReviewsView,
  pageSize: number = REVIEWS_PAGE_SIZE,
): Promise<ReviewPage> {
  const result = await publicClient().rpc("list_profile_reviews", {
    p_subject: profileId,
    p_page: view.page,
    p_page_size: pageSize,
    ...(view.role ? { p_role: view.role } : {}),
  });
  if (result.error) throw new Error("Unable to load reviews.");
  const page = reviewPage.safeParse(result.data);
  if (!page.success) throw new Error("Unable to load reviews.");
  return page.data;
}

/**
 * The count and average for a profile, optionally for one role. Null when it
 * can't be loaded: a rating is extra detail, so its page still renders.
 */
export async function getRatingSummary(
  profileId: string,
  role: ReviewRole | null = null,
): Promise<RatingSummary | null> {
  if (!reviewId.safeParse(profileId).success) return null;
  try {
    const page = await getProfileReviews(profileId, { page: 1, role }, 1);
    return page.summary;
  } catch {
    return null;
  }
}

export type PublicProfile = { displayName: string; memberSince: string };

/**
 * The public profile projection from lib/profiles/README.md. Null for an
 * unknown or suspended profile, whose reviews still stay public.
 */
export async function getPublicProfile(
  profileId: string,
): Promise<PublicProfile | null> {
  const result = await publicClient()
    .from("profiles")
    .select("id,display_name,created_at")
    .eq("id", profileId)
    .maybeSingle();
  if (result.error) throw new Error("Unable to load the profile.");
  return result.data
    ? {
        displayName: result.data.display_name,
        memberSince: result.data.created_at,
      }
    : null;
}
