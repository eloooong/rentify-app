import Link from "next/link";
import { AuthForm } from "../_components/auth-form";
export const metadata = { title: "Verify email | Rentify" };
export default function VerifyEmailPage() {
  return (
    <section aria-labelledby="verify-title" className="space-y-6">
      <div className="space-y-2">
        <h1 id="verify-title" className="text-3xl font-semibold tracking-tight">
          Verify your email
        </h1>
        <p className="text-muted-foreground">
          Need another verification link? Enter the email you used to create
          your account.
        </p>
      </div>
      <AuthForm mode="verify" />
      <Link
        className="inline-block text-sm text-primary underline underline-offset-4"
        href="/login"
      >
        Back to sign in
      </Link>
    </section>
  );
}
