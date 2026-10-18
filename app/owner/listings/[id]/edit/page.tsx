import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadError, ProfileRequired } from "@/components/listings/editor-shell";
import { ListingForm } from "@/components/listings/listing-form";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import type { EditorCategory } from "@/lib/listings/editor";
import {
  getEditorCategories,
  getOwnListing,
  hasProfile,
  type OwnListing,
} from "@/lib/listings/owner";

export const metadata: Metadata = {
  title: "Edit listing | Rentify",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  paused: "Paused",
  hidden: "Restricted",
};

const SAVED_NOTICE: Record<string, string> = {
  draft: "Saved as a draft. Only you can see it.",
  published: "Published. Renters can now find this listing.",
  paused: "Saved and paused. Renters can't see it until you publish again.",
  partial:
    "Your draft was saved, but some changes didn't finish (for example a photo upload). Check the listing below and save again.",
};

export default async function EditListingPage(
  props: PageProps<"/owner/listings/[id]/edit">,
) {
  const { id } = await props.params;
  const { saved } = await props.searchParams;
  const returnTo = `/owner/listings/${id}/edit`;
  const user = await requireUser(returnTo);

  let categories: EditorCategory[] = [];
  let listing: OwnListing | null = null;
  let profile = false;
  let failed = false;
  try {
    [categories, listing, profile] = await Promise.all([
      getEditorCategories(),
      getOwnListing(id, user.id),
      hasProfile(user.id),
    ]);
  } catch {
    failed = true;
  }
  if (!failed && !listing) notFound();

  const notice = typeof saved === "string" ? SAVED_NOTICE[saved] : undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/owner/listings"
          className="text-muted-foreground hover:text-brand-strong hover:underline"
        >
          ← My listings
        </Link>
      </nav>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-fg">Edit listing</h1>
        {listing && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge
              variant={listing.status === "published" ? "default" : "secondary"}
            >
              {STATUS_LABEL[listing.status] ?? listing.status}
            </Badge>
            {listing.status === "published" && (
              <Link
                href={`/listings/${listing.id}`}
                className="font-medium text-fg underline underline-offset-4 hover:text-brand-strong"
              >
                View public listing
              </Link>
            )}
          </div>
        )}
      </div>

      {notice && (
        <p
          role="status"
          className={`rounded-lg border p-4 text-sm ${
            saved === "partial"
              ? "border-destructive bg-surface"
              : "border-border bg-surface-muted"
          }`}
        >
          {notice}
        </p>
      )}

      {listing?.status === "hidden" && (
        <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm">
          This listing has been restricted by the Rentify team, so it can&apos;t
          be edited.
        </p>
      )}

      {failed ? (
        <LoadError />
      ) : !profile ? (
        <ProfileRequired returnTo={returnTo} />
      ) : (
        // Re-mount on every save so the form starts from what the server saved.
        <ListingForm
          key={`${listing!.updated_at}-${listing!.photos.length}`}
          categories={categories}
          listing={listing!}
        />
      )}
    </div>
  );
}
