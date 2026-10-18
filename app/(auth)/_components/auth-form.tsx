"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "@/lib/auth/validation";
import {
  requestPasswordReset,
  resendVerification,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "../actions";

const modes = {
  login: { action: signIn, label: "Sign in", pending: "Signing in…" },
  signup: {
    action: signUp,
    label: "Create account",
    pending: "Creating account…",
  },
  forgot: {
    action: requestPasswordReset,
    label: "Send reset link",
    pending: "Sending link…",
  },
  verify: {
    action: resendVerification,
    label: "Send verification link",
    pending: "Sending link…",
  },
  password: {
    action: updatePassword,
    label: "Save new password",
    pending: "Saving password…",
  },
  logout: { action: signOut, label: "Sign out", pending: "Signing out…" },
};

export function AuthForm({
  mode,
  next = "/account",
}: {
  mode: keyof typeof modes;
  next?: string;
}) {
  const settings = modes[mode];
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState<AuthState, FormData>(
    settings.action,
    { status: "idle" },
  );
  const message = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== "idle") message.current?.focus();
  }, [state]);
  const hasEmail = ["login", "signup", "forgot", "verify"].includes(mode);
  const hasPassword = ["login", "signup", "password"].includes(mode);
  const fieldError = (name: "email" | "password" | "confirmPassword") =>
    state.errors?.[name]?.join(" ");

  return (
    <form action={action} className="flex flex-col gap-5" aria-busy={pending}>
      <input type="hidden" name="next" value={next} />
      {state.message && (
        <div
          ref={message}
          tabIndex={-1}
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              : "rounded-lg bg-secondary p-3 text-sm text-secondary-foreground"
          }
        >
          {state.message}
        </div>
      )}
      {hasEmail && (
        <div className="grid gap-2">
          <Label htmlFor="auth-email">Email address</Label>
          <Input
            className="h-11"
            id="auth-email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            aria-invalid={!!fieldError("email")}
            aria-describedby={
              fieldError("email") ? "auth-email-error" : undefined
            }
          />
          {fieldError("email") && (
            <p id="auth-email-error" className="text-sm text-destructive">
              {fieldError("email")}
            </p>
          )}
        </div>
      )}
      {hasPassword && (
        <div className="grid gap-2">
          <Label htmlFor="auth-password">
            {mode === "password" ? "New password" : "Password"}
          </Label>
          <Input
            className="h-11"
            id="auth-password"
            name="password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={mode === "login" ? 1 : 8}
            maxLength={128}
            required
            aria-invalid={!!fieldError("password")}
            aria-describedby="auth-password-help"
          />
          <p
            id="auth-password-help"
            className={
              fieldError("password")
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {fieldError("password") ||
              (mode === "login"
                ? "Use the password for your Rentify account."
                : "Use 8–128 characters. A unique passphrase works well.")}
          </p>
        </div>
      )}
      {mode === "password" && (
        <div className="grid gap-2">
          <Label htmlFor="auth-confirm-password">Confirm new password</Label>
          <Input
            className="h-11"
            id="auth-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            required
            aria-invalid={!!fieldError("confirmPassword")}
            aria-describedby={
              fieldError("confirmPassword") ? "auth-confirm-error" : undefined
            }
          />
          {fieldError("confirmPassword") && (
            <p id="auth-confirm-error" className="text-sm text-destructive">
              {fieldError("confirmPassword")}
            </p>
          )}
        </div>
      )}
      <Button type="submit" className="min-h-11 w-full" disabled={pending}>
        {pending ? settings.pending : settings.label}
      </Button>
    </form>
  );
}
