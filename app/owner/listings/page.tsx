import type { Metadata } from "next";
import Link from "next/link";
import { MyListingActions } from "@/components/listings/my-listing-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { formatMoney } from "@/lib/listings/format";
import { STATUS_HINT, STATUS_LABEL } from "@/lib/listings/manage";
import { listOwnListings, type OwnListingsPage } from "@/lib/listings/owner";

export const metadata: Metadata = {
  title: "My listings | Rentify",
  robots: { index: false, follow: false },
};

export default async function MyListingsPage(
  props: PageProps<"/owner/listings">,
) {
  const user = await requireUser("/owner/listings");
  const { page: pageParam } = await props.searchParams;
  const requested = Number(typeof pageParam === "string" ? pageParam : "1");
  const page =
    Number.isInteger(requested) && requested >= 1 && requested <= 10000
      ? requested
      : 1;

  let result: OwnListingsPage | null = null;
  try {
    result = await listOwnListings(user.id, page);
  } catch {
    result = null;
  }
  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / result.pageSize))
    : 1;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-fg">My listings</h1>
          {result && result.total > 0 && (
            <p className="mt-1 text-muted-foreground">
              {result.total} {result.total === 1 ? "listing" : "listings"}
            </p>
          )}
        </div>
        <Button asChild>
          <Link href="/owner/listings/new">List a device</Link>
        </Button>
      </div>

      {!result ? (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface-muted p-6"
        >
          <h2 className="text-lg font-semibold text-fg">
            We couldn&apos;t load your listings
          </h2>
          <p className="mt-1">Please refresh the page in a moment.</p>
        </div>
      ) : result.total === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-fg">No listings yet</h2>
          <p className="mt-1">
            Lend a gadget you rarely use and earn from it. It takes a few
            minutes.
          </p>
          <Button asChild className="mt-4">
            <Link href="/owner/listings/new">List your first device</Link>
          </Button>
        </div>
      ) : result.listings.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-fg">
            This page is past your last listing
          </h2>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/owner/listings">Back to the first page</Link>
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {result.listings.map((listing) => {
              const cover = listing.photos[0];
              return (
                <li
                  key={listing.id}
                  className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row"
                >
                  <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-md bg-surface-muted sm:w-40">
                    {cover ? (
                      // Owner previews of private photos need the session
                      // cookie, so no image optimizer (lib/catalog/README.md).
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
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-fg">
                        {listing.title}
                      </h2>
                      <Badge
                        variant={
                          listing.status === "published"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {STATUS_LABEL[listing.status] ?? listing.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {STATUS_HINT[listing.status]}
                    </p>
                    <p className="text-sm">
                      <span className="font-semibold text-fg">
                        {formatMoney(
                          listing.daily_price_amount,
                          listing.currency,
                        )}
                      </span>{" "}
                      / day · Deposit{" "}
                      {formatMoney(listing.deposit_amount, listing.currency)}
                      {" · "}
                      {listing.photos.length}{" "}
                      {listing.photos.length === 1 ? "photo" : "photos"}
                    </p>
                    {listing.status === "published" && (
                      <Link
                        href={`/listings/${listing.id}`}
                        className="w-fit text-sm font-medium text-fg underline underline-offset-4 hover:text-brand-strong"
                      >
                        View public listing
                        <span className="sr-only"> for {listing.title}</span>
                      </Link>
                    )}
                    <MyListingActions listing={listing} />
                  </div>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-between gap-3 border-t border-border pt-4"
            >
              {page > 1 ? (
                <Button asChild variant="outline">
                  <Link href={`/owner/listings?page=${page - 1}`} rel="prev">
                    Previous
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              {page < totalPages ? (
                <Button asChild variant="outline">
                  <Link href={`/owner/listings?page=${page + 1}`} rel="next">
                    Next
                  </Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
