import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeReturnPath } from "./validation";

export async function requireUser(returnTo = "/account") {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at)
    redirect(`/login?next=${encodeURIComponent(safeReturnPath(returnTo))}`);
  return user;
}
