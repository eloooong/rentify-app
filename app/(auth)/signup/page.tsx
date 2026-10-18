import Link from "next/link";
import { AuthForm } from "../_components/auth-form";
export const metadata = { title: "Create account | Rentify" };
export default function SignupPage() {
  return (
    <section aria-labelledby="signup-title" className="space-y-6">
      <div className="space-y-2">
        <h1 id="signup-title" className="text-3xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="text-muted-foreground">
          Join Rentify to rent and lend gadgets. Verify your email before
          signing in.
        </p>
      </div>
      <AuthForm mode="signup" />
      <p className="border-t border-border pt-5 text-sm">
        Already have an account?{" "}
        <Link
          className="text-primary underline underline-offset-4"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </section>
  );
}
