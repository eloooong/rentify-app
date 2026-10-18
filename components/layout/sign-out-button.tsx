"use client";

import { useActionState } from "react";
import { signOut } from "@/app/(auth)/actions";
import type { AuthState } from "@/lib/auth/validation";

const initialState: AuthState = { status: "idle" };

// Wraps Person B's signOut server action. On success the action redirects to
// /login; on failure it returns a generic message, announced below.
export function SignOutButton({ className = "" }: { className?: string }) {
  const [state, action, pending] = useActionState<AuthState>(
    signOut,
    initialState,
  );

  return (
    <form action={action} className="contents">
      <button
        type="submit"
        disabled={pending}
        className={`text-sm font-medium text-fg hover:text-brand-strong disabled:opacity-60 ${className}`}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={
          state.status === "error" ? "text-xs text-destructive" : "sr-only"
        }
      >
        {state.status === "error" ? state.message : ""}
      </p>
    </form>
  );
}
