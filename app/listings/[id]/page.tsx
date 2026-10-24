import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingPanel } from "@/components/bookings/booking-panel";
import { getSignedInUser } from "@/components/layout/get-signed-in-user";
import { OwnerCard } from "@/components/listings/owner-card";
import { PhotoGallery } from "@/components/listings/photo-gallery";
import { Badge } from "@/components/ui/badge";
import { getAppOrigin } from "@/lib/auth/config";
import { getPublicListing } from "@/lib/listings/detail";
import { formatMoney } from "@/lib/listings/format";
import { buildSpecs } from "@/lib/listings/specs";

function summary(text: string, fallback: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > 155 ? `${clean.slice(0, 152)}…` : clean;
}

export async function generateMetadata(
  props: PageProps<"/listings/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  let listing = null;
  try {
    listing = await getPublicListing(id);
  } catch {
    return { title: "Listing | Rentify" };
  }
  if (!listing) return { title: "Listing not found | Rentify" };

  const price = formatMoney(listing.daily_price_amount, listing.currency);
  const description = summary(
    listing.description,
    `Rent ${listing.title} for ${price} a day in ${listing.pickup_area}.`,
  );
  let image: string | undefined;
  try {
    // Open Graph needs an absolute URL; the photo route is public while the
    // listing is published.
    if (listing.photos[0])
      image = new URL(listing.photos[0].url, getAppOrigin()).toString();
  } catch {
    image = undefined;
  }

  return {
    title: `${listing.title} | Rentify`,
    description,
    openGraph: {
      title: listing.title,
      description,
      type: "website",
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

export default async function ListingDetailPage(
  props: PageProps<"/listings/[id]">,
) {
  const { id } = await props.params;
  const [listing, user] = await Promise.all([
    getPublicListing(id),
    getSignedInUser(),
  ]);
  if (!listing) notFound();

  const specs = buildSpecs(
    listing.category?.attributeSchema,
    listing.attributes,
  );
  const currency = listing.currency;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
          <li>
            <Link
              href="/listings"
              className="hover:text-brand-strong hover:underline"
            >
              Browse
            </Link>
          </li>
          {listing.category && (
            <li className="flex items-center gap-1">
              <span aria-hidden="true">/</span>
              <Link
                href={`/listings?category=${encodeURIComponent(listing.category.slug)}`}
                className="hover:text-brand-strong hover:underline"
              >
                {listing.category.name}
              </Link>
            </li>
          )}
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PhotoGallery photos={listing.photos} title={listing.title} />

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-fg sm:text-3xl">
              {listing.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{listing.condition}</Badge>
              <span>Pickup: {listing.pickup_area}</span>
            </div>
          </div>

          <section
            aria-labelledby="price-heading"
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <h2 id="price-heading" className="sr-only">
              Price and booking
            </h2>
            <p>
              <span className="text-3xl font-semibold text-fg">
                {formatMoney(listing.daily_price_amount, currency)}
              </span>
              <span className="text-muted-foreground"> / day</span>
            </p>
            <p className="text-sm">
              Deposit:{" "}
              <span className="font-semibold text-fg">
                {formatMoney(listing.deposit_amount, currency)}
              </span>
            </p>
            <BookingPanel
              listingId={listing.id}
              dailyPrice={listing.daily_price_amount}
              deposit={listing.deposit_amount}
              currency={currency}
              signedIn={Boolean(user)}
              isOwner={user?.id === listing.owner_id}
            />
          </section>

          <OwnerCard owner={listing.owner} />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="description-heading">
          <h2
            id="description-heading"
            className="text-lg font-semibold text-fg"
          >
            About this device
          </h2>
          <p className="mt-2 whitespace-pre-line">
            {listing.description || "The owner hasn't added a description."}
          </p>
        </section>

        {specs.length > 0 && (
          <section aria-labelledby="specs-heading">
            <h2 id="specs-heading" className="text-lg font-semibold text-fg">
              Specs
            </h2>
            <dl className="mt-2 divide-y divide-border rounded-lg border border-border">
              {specs.map((spec) => (
                <div
                  key={spec.label}
                  className="flex justify-between gap-4 px-4 py-2 text-sm"
                >
                  <dt className="text-muted-foreground">{spec.label}</dt>
                  <dd className="text-right font-medium text-fg">
                    {spec.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
