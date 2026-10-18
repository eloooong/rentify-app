import type { CatalogListing } from "@/lib/catalog/types";
import { updatePayload, type ListingStatus } from "./editor";

/*
 * Pure logic for the owner's "My listings" page (A1.2). The rules follow
 * Person B's catalog contract (lib/catalog/README.md): publishing needs at
 * least one photo; PATCH always sends the full editable payload; a listing
 * can only be deleted as a draft with no photos and no booking references;
 * hidden (moderated) listings can't be changed by the owner.
 */

export type ManagedListing = CatalogListing & { hasBookings: boolean };

export type Action = { allowed: boolean; reason?: string };

export type ListingActions = {
  edit: Action;
  publish: Action;
  pause: Action;
  remove: Action;
};

const RESTRICTED = "Restricted by the Rentify team.";

export function listingActions(listing: ManagedListing): ListingActions {
  if (listing.status === "hidden") {
    const blocked = { allowed: false, reason: RESTRICTED };
    return { edit: blocked, publish: blocked, pause: blocked, remove: blocked };
  }
  const hasPhoto = listing.photos.length > 0;
  return {
    edit: { allowed: true },
    publish:
      listing.status === "published"
        ? { allowed: false }
        : hasPhoto
          ? { allowed: true }
          : { allowed: false, reason: "Add a photo before publishing." },
    pause: { allowed: listing.status === "published" },
    remove: listing.hasBookings
      ? {
          allowed: false,
          reason:
            "Listings with booking history can't be deleted. Pause it instead.",
        }
      : { allowed: true },
  };
}

/** The full PATCH body for changing only the status of a stored listing. */
export function statusChangeBody(
  listing: CatalogListing,
  status: ListingStatus,
) {
  return updatePayload(
    {
      category_id: listing.category_id,
      title: listing.title,
      description: listing.description,
      daily_price_amount: listing.daily_price_amount,
      deposit_amount: listing.deposit_amount,
      currency: listing.currency,
      condition: listing.condition,
      pickup_area: listing.pickup_area,
      attributes: (listing.attributes ?? {}) as Record<string, string | number>,
    },
    status,
  );
}

export type DeleteStep =
  { kind: "draft" } | { kind: "photo"; photoId: string } | { kind: "listing" };

/**
 * The requests that delete a listing, in the order the API requires:
 * return to draft (a published listing can't lose its last photo), remove
 * every photo, then delete the listing itself.
 */
export function deleteSteps(listing: CatalogListing): DeleteStep[] {
  return [
    ...(listing.status === "draft" ? [] : [{ kind: "draft" } as const]),
    ...listing.photos.map((photo) => ({
      kind: "photo" as const,
      photoId: photo.id,
    })),
    { kind: "listing" },
  ];
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  paused: "Paused",
  hidden: "Restricted",
};

export const STATUS_HINT: Record<string, string> = {
  draft: "Only you can see it.",
  published: "Renters can find it.",
  paused: "Hidden from renters until you publish again.",
  hidden: "Restricted by the Rentify team; it can't be changed.",
};
