"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createActionClient } from "@/lib/supabase/action";
import { profileSchema, type ProfileState } from "@/lib/profiles/validation";

export async function saveProfile(
  _previous: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  const input = profileSchema.safeParse({
    displayName: form.get("displayName"),
    phone: form.get("phone"),
  });
  if (!input.success)
    return {
      status: "error",
      message: "Check the highlighted fields.",
      errors: z.flattenError(input.error).fieldErrors,
    };
  try {
    const client = await createActionClient();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user?.email_confirmed_at)
      return {
        status: "error",
        message: "Sign in with a verified email before saving your profile.",
      };
    const { error } = await client.rpc("save_my_profile", {
      p_display_name: input.data.displayName,
      ...(input.data.phone ? { p_phone: input.data.phone } : {}),
    });
    if (error)
      return {
        status: "error",
        message:
          "We couldn't save your profile. Try again, or contact support if your account is restricted.",
      };
  } catch {
    return {
      status: "error",
      message: "Profile saving is temporarily unavailable. Please try again.",
    };
  }
  revalidatePath("/account");
  return {
    status: "success",
    message: "Profile saved. Your phone number stays private.",
  };
}
