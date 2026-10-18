"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppOrigin } from "@/lib/auth/config";
import {
  emailSchema,
  loginSchema,
  passwordSchema,
  safeReturnPath,
  signupSchema,
  type AuthState,
} from "@/lib/auth/validation";
import { createActionClient } from "@/lib/supabase/action";

const unavailable: AuthState = {
  status: "error",
  message: "We couldn't complete that request. Please try again shortly.",
};
function invalid(error: z.ZodError): AuthState {
  return {
    status: "error",
    message: "Check the highlighted fields.",
    errors: z.flattenError(error).fieldErrors,
  };
}

export async function signIn(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const input = loginSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!input.success) return invalid(input.error);
  try {
    const client = await createActionClient();
    const { data, error } = await client.auth.signInWithPassword(input.data);
    if (error || !data.user?.email_confirmed_at) {
      return {
        status: "error",
        message:
          "We couldn't sign you in. Check your email and password, and make sure your email is verified.",
      };
    }
  } catch {
    return unavailable;
  }
  revalidatePath("/", "layout");
  redirect(safeReturnPath(form.get("next")));
}

export async function signUp(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const input = signupSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!input.success) return invalid(input.error);
  try {
    const client = await createActionClient();
    const { error } = await client.auth.signUp({
      ...input.data,
      options: { emailRedirectTo: `${getAppOrigin()}/auth/callback` },
    });
    if (
      error &&
      !["user_already_exists", "email_exists"].includes(error.code ?? "")
    )
      return unavailable;
    return {
      status: "success",
      message:
        "Check your email for a verification link. If you already have an account, you can sign in instead.",
    };
  } catch {
    return unavailable;
  }
}

async function sendEmail(
  form: FormData,
  recovery: boolean,
): Promise<AuthState> {
  const input = emailSchema.safeParse({ email: form.get("email") });
  if (!input.success) return invalid(input.error);
  try {
    const client = await createActionClient();
    const { error } = recovery
      ? await client.auth.resetPasswordForEmail(input.data.email, {
          redirectTo: `${getAppOrigin()}/auth/callback?next=/update-password`,
        })
      : await client.auth.resend({
          type: "signup",
          email: input.data.email,
          options: { emailRedirectTo: `${getAppOrigin()}/auth/callback` },
        });
    if (
      error &&
      ![
        "user_not_found",
        "email_not_confirmed",
        "email_already_confirmed",
      ].includes(error.code ?? "")
    )
      return unavailable;
    return {
      status: "success",
      message: recovery
        ? "If an account exists for that email, a password reset link is on its way. Check your inbox."
        : "If that account needs verification, a new link is on its way. Check your inbox.",
    };
  } catch {
    return unavailable;
  }
}

export async function requestPasswordReset(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  return sendEmail(form, true);
}

export async function resendVerification(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  return sendEmail(form, false);
}

export async function updatePassword(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const input = passwordSchema.safeParse({
    password: form.get("password"),
    confirmPassword: form.get("confirmPassword"),
  });
  if (!input.success) return invalid(input.error);
  let changed = false;
  try {
    const client = await createActionClient();
    const {
      data: { user },
      error: identityError,
    } = await client.auth.getUser();
    if (identityError || !user?.email_confirmed_at)
      return {
        status: "error",
        message:
          "Open a fresh reset link from your email or sign in before changing your password.",
      };
    const { error } = await client.auth.updateUser({
      password: input.data.password,
    });
    if (error)
      return {
        status: "error",
        message:
          "We couldn't update your password. Choose a different password or request a fresh reset link.",
      };
    changed = true;
    const { error: logoutError } = await client.auth.signOut({
      scope: "global",
    });
    if (logoutError) throw logoutError;
  } catch {
    return changed
      ? {
          status: "error",
          message:
            "Your password was changed, but we couldn't finish signing you out. Please sign out from your account, then sign in with your new password.",
        }
      : unavailable;
  }
  revalidatePath("/", "layout");
  redirect("/login?notice=password-updated");
}

export async function signOut(): Promise<AuthState> {
  try {
    const client = await createActionClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return unavailable;
  } catch {
    return unavailable;
  }
  revalidatePath("/", "layout");
  redirect("/login?notice=signed-out");
}
