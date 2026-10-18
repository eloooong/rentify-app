import type { Metadata } from "next";
import { LoadError, ProfileRequired } from "@/components/listings/editor-shell";
import { ListingForm } from "@/components/listings/listing-form";
import { requireUser } from "@/lib/auth/session";
import type { EditorCategory } from "@/lib/listings/editor";
import { getEditorCategories, hasProfile } from "@/lib/listings/owner";

export const metadata: Metadata = {
  title: "List a device | Rentify",
  robots: { index: false, follow: false },
};

export default async function NewListingPage() {
  // The /owner proxy already redirects signed-out visitors; this also gives
  // the verified user's ID and rejects unverified emails.
  const user = await requireUser("/owner/listings/new");

  let categories: EditorCategory[] = [];
  let profile = false;
  let failed = false;
  try {
    [categories, profile] = await Promise.all([
      getEditorCategories(),
      hasProfile(user.id),
    ]);
  } catch {
    failed = true;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-3xl font-semibold text-fg">List a device</h1>
        <p className="mt-1 text-muted-foreground">
          Your listing is saved as a draft until you publish it.
        </p>
      </div>
      {failed ? (
        <LoadError />
      ) : !profile ? (
        <ProfileRequired returnTo="/owner/listings/new" />
      ) : (
        <ListingForm categories={categories} />
      )}
    </div>
  );
}
