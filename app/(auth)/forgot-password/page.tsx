import Link from "next/link";
import { AuthForm } from "../_components/auth-form";
export const metadata = { title: "Reset password | Rentify" };
export default function ForgotPasswordPage() {
  return (
    <section aria-labelledby="reset-title" className="space-y-6">
      <div className="space-y-2">
        <h1 id="reset-title" className="text-3xl font-semibold tracking-tight">
          Forgot your password?
        </h1>
        <p className="text-muted-foreground">
          Enter your account email. We&apos;ll send a link to choose a new
          password.
        </p>
      </div>
      <AuthForm mode="forgot" />
      <Link
        className="inline-block text-sm text-primary underline underline-offset-4"
        href="/login"
      >
        Back to sign in
      </Link>
    </section>
  );
}
