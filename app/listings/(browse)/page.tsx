import type { Metadata } from "next";
import Link from "next/link";
import { BrowseFilters } from "@/components/listings/browse-filters";
import { CategoryChips } from "@/components/listings/category-chips";
import { ListingCard } from "@/components/listings/listing-card";
import { Pagination } from "@/components/listings/pagination";
import { Button } from "@/components/ui/button";
import type { CatalogPage } from "@/lib/catalog/types";
import { getCategories, searchListings } from "@/lib/search/browse";
import {
  browseHref,
  parseBrowseParams,
  type CategoryOption,
} from "@/lib/search/browse-params";

export const metadata: Metadata = {
  title: "Browse devices | Rentify",
  description:
    "Find laptops, cameras, drones and other gadgets to rent for a few days.",
};

export default async function BrowsePage(props: PageProps<"/listings">) {
  const searchParams = await props.searchParams;

  let categories: CategoryOption[] = [];
  let results: CatalogPage | null = null;
  let loadFailed = false;
  try {
    categories = await getCategories();
  } catch {
    loadFailed = true;
  }

  const params = parseBrowseParams(searchParams, categories);
  if (!loadFailed && params.query) {
    try {
      results = await searchListings(params.query);
    } catch {
      loadFailed = true;
    }
  }

  const { form } = params;
  const searching = Boolean(form.q || form.category || form.min || form.max);
  const total = results?.pagination.total ?? 0;
  const totalPages = results
    ? Math.max(1, Math.ceil(total / results.pagination.pageSize))
    : 1;
  const firstShown = results
    ? (params.page - 1) * results.pagination.pageSize + 1
    : 0;
  const lastShown = results ? firstShown + results.data.length - 1 : 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold text-fg">Browse devices</h1>

      <BrowseFilters form={form} categories={categories} />
      {categories.length > 0 && (
        <CategoryChips form={form} categories={categories} />
      )}

      {loadFailed ? (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface-muted p-6"
        >
          <h2 className="text-lg font-semibold text-fg">
            We couldn&apos;t load devices right now
          </h2>
          <p className="mt-1">Please try again in a moment.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={browseHref(form, { page: params.page })}>
              Try again
            </Link>
          </Button>
        </div>
      ) : params.error ? (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface-muted p-6"
        >
          <h2 className="text-lg font-semibold text-fg">Check your filters</h2>
          <p className="mt-1">{params.error}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/listings">Clear filters</Link>
          </Button>
        </div>
      ) : results && total === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-fg">
            {searching
              ? "No devices match your search"
              : "No devices listed yet"}
          </h2>
          <p className="mt-1">
            {searching
              ? "Try a different word, another category or a wider price range."
              : "Be the first to lend a gadget you rarely use."}
          </p>
          <Button asChild variant="outline" className="mt-4">
            {searching ? (
              <Link href="/listings">Clear filters</Link>
            ) : (
              <Link href="/owner/listings/new">Lend a device</Link>
            )}
          </Button>
        </div>
      ) : results && results.data.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-fg">
            This page is past the last result
          </h2>
          <Button asChild variant="outline" className="mt-4">
            <Link href={browseHref(form)}>Back to the first page</Link>
          </Button>
        </div>
      ) : results ? (
        <section
          aria-labelledby="results-heading"
          className="flex flex-col gap-4"
        >
          <h2 id="results-heading" className="text-sm text-muted-foreground">
            Showing {firstShown}–{lastShown} of {total}{" "}
            {total === 1 ? "device" : "devices"}
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.data.map((listing) => (
              <li key={listing.id} className="flex">
                <ListingCard listing={listing} />
              </li>
            ))}
          </ul>
          <Pagination form={form} page={params.page} totalPages={totalPages} />
        </section>
      ) : null}
    </div>
  );
}
