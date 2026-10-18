import Link from "next/link";
import { safeReturnPath } from "@/lib/auth/validation";
import { AuthForm } from "../_components/auth-form";

export const metadata = { title: "Sign in | Rentify" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const notice =
    params.notice === "password-updated"
      ? "Your password was updated. Sign in with your new password."
      : params.notice === "signed-out"
        ? "You are signed out."
        : null;
  return (
    <section aria-labelledby="login-title" className="space-y-6">
      <div className="space-y-2">
        <h1 id="login-title" className="text-3xl font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="text-muted-foreground">
          Sign in to your Rentify account.
        </p>
      </div>
      {notice && (
        <p role="status" className="rounded-lg bg-secondary p-3 text-sm">
          {notice}
        </p>
      )}
      <AuthForm mode="login" next={safeReturnPath(params.next)} />
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <Link
          className="text-primary underline underline-offset-4"
          href="/forgot-password"
        >
          Forgot password?
        </Link>
        <Link
          className="text-primary underline underline-offset-4"
          href="/verify-email"
        >
          Resend verification email
        </Link>
      </div>
      <p className="border-t border-border pt-5 text-sm">
        New to Rentify?{" "}
        <Link
          className="text-primary underline underline-offset-4"
          href="/signup"
        >
          Create an account
        </Link>
      </p>
    </section>
  );
}
