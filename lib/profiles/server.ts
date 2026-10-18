import "server-only";
import { createClient } from "@/lib/supabase/server";

// Caller must verify identity first. RLS still limits private reads to auth.uid().
export async function getOwnProfile(userId: string) {
  const client = await createClient();
  const [profile, privateProfile] = await Promise.all([
    client
      .from("profiles")
      .select("id,display_name,avatar_path,created_at,updated_at")
      .eq("id", userId)
      .maybeSingle(),
    client
      .from("profile_private")
      .select("user_id,phone,phone_verified_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (profile.error || privateProfile.error)
    return { status: "error" as const };
  return {
    status: "success" as const,
    profile: profile.data,
    privateProfile: privateProfile.data,
  };
}
