import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Shown instead of the form when the owner has no profile yet. */
export function ProfileRequired({ returnTo }: { returnTo: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-6">
      <h2 className="text-lg font-semibold text-fg">
        Complete your profile first
      </h2>
      <p className="mt-1">
        Renters see your display name on your listings, so Rentify needs a
        profile before you can list a device.
      </p>
      <Button asChild className="mt-4">
        <Link href={`/account?next=${encodeURIComponent(returnTo)}`}>
          Complete your profile
        </Link>
      </Button>
    </div>
  );
}

export function LoadError() {
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-surface-muted p-6"
    >
      <h2 className="text-lg font-semibold text-fg">
        We couldn&apos;t load the listing editor
      </h2>
      <p className="mt-1">Please refresh the page in a moment.</p>
    </div>
  );
}
