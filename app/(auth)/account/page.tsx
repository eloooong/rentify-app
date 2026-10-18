import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { AuthForm } from "../_components/auth-form";
export const metadata = { title: "Your account | Rentify" };
export default async function AccountPage() {
  const user = await requireUser();
  return (
    <section aria-labelledby="account-title" className="space-y-6">
      <div className="space-y-2">
        <h1
          id="account-title"
          className="text-3xl font-semibold tracking-tight"
        >
          Your account
        </h1>
        <p className="text-muted-foreground">
          Manage your Rentify sign-in details.
        </p>
      </div>
      <dl className="space-y-4 border-y border-border py-5">
        <div>
          <dt className="text-sm text-muted-foreground">Email address</dt>
          <dd className="mt-1 break-all font-medium">{user.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Email verification</dt>
          <dd className="mt-1 font-medium">Verified</dd>
        </div>
      </dl>
      <Link
        className="inline-block text-sm text-primary underline underline-offset-4"
        href="/update-password"
      >
        Change password
      </Link>
      <AuthForm mode="logout" />
    </section>
  );
}
