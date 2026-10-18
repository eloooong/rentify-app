import { requireUser } from "@/lib/auth/session";
import { AuthForm } from "../_components/auth-form";
export const metadata = { title: "New password | Rentify" };
export default async function UpdatePasswordPage() {
  await requireUser("/update-password");
  return (
    <section aria-labelledby="password-title" className="space-y-6">
      <div className="space-y-2">
        <h1
          id="password-title"
          className="text-3xl font-semibold tracking-tight"
        >
          Set a new password
        </h1>
        <p className="text-muted-foreground">
          Choose a unique password. You&apos;ll sign in again after saving it.
        </p>
      </div>
      <AuthForm mode="password" />
    </section>
  );
}
