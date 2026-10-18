import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { CatalogListing } from "@/lib/catalog/types";
import { formatMoney } from "@/lib/listings/format";

export function ListingCard({ listing }: { listing: CatalogListing }) {
  const cover = listing.photos[0];

  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-[4/3] bg-surface-muted">
        {cover ? (
          // Access-checked photo URLs must not go through the image optimizer
          // (see lib/catalog/README.md), so this is a plain <img>.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.url}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
            No photo
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-base font-semibold text-fg">
          {/* The link covers the whole card, so the card has one tab stop. */}
          <Link
            href={`/listings/${listing.id}`}
            className="after:absolute after:inset-0 focus-visible:rounded-sm"
          >
            {listing.title}
          </Link>
        </h3>
        <p>
          <span className="text-lg font-semibold text-fg">
            {formatMoney(listing.daily_price_amount, listing.currency)}
          </span>
          <span className="text-sm text-muted-foreground"> / day</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Deposit {formatMoney(listing.deposit_amount, listing.currency)}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground">
          <Badge variant="secondary">{listing.condition}</Badge>
          <span>{listing.pickup_area}</span>
        </div>
      </div>
    </article>
  );
}
