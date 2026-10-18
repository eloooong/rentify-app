import Link from "next/link";
export const metadata = { title: "Link unavailable | Rentify" };
export default function AuthErrorPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        That link is no longer available
      </h1>
      <p className="text-muted-foreground">
        It may have expired or already been used. Request a new link to
        continue.
      </p>
      <ul className="space-y-4 text-sm">
        <li>
          <Link
            className="text-primary underline underline-offset-4"
            href="/verify-email"
          >
            Send a new verification link
          </Link>
        </li>
        <li>
          <Link
            className="text-primary underline underline-offset-4"
            href="/forgot-password"
          >
            Request a password reset
          </Link>
        </li>
        <li>
          <Link
            className="text-primary underline underline-offset-4"
            href="/login"
          >
            Back to sign in
          </Link>
        </li>
      </ul>
    </section>
  );
}
