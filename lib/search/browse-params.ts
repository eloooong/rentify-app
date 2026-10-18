import type { z } from "zod";
import { querySchema } from "@/lib/catalog/validation";

/** Validated input for the public catalog query (Person B's querySchema). */
export type BrowseQuery = z.output<typeof querySchema>;
export type BrowseSort = BrowseQuery["sort"];

/** Values to echo back into the filter form and pagination links. */
export type BrowseFormValues = {
  q: string;
  category: string;
  min: string;
  max: string;
  sort: BrowseSort;
};

export type CategoryOption = { id: string; slug: string; name: string };

export type BrowseParams = {
  form: BrowseFormValues;
  /** Valid query, or null when the visitor's filters cannot be used. */
  query: BrowseQuery | null;
  /** Plain-language problem with the filters, shown above the results. */
  error: string | null;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

export const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

export const PAGE_SIZE = 20;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** "1,250.50" or "1250" pesos -> 125050 centavos. Null when invalid. */
export function pesosToMinor(input: string): number | null {
  const cleaned = input.replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/**
 * Turns the page's own URL params (?q, category slug, min/max in pesos, sort,
 * page) into the catalog query. The page URL uses friendly values; the
 * catalog query uses category IDs and integer minor units, validated by the
 * same schema as GET /api/catalog/listings so the two cannot drift.
 */
export function parseBrowseParams(
  searchParams: SearchParams,
  categories: CategoryOption[],
): BrowseParams {
  const sortParam = first(searchParams.sort);
  const form: BrowseFormValues = {
    q: first(searchParams.q),
    category: first(searchParams.category),
    min: first(searchParams.min),
    max: first(searchParams.max),
    sort: SORT_OPTIONS.some((option) => option.value === sortParam)
      ? (sortParam as BrowseSort)
      : "newest",
  };
  const pageNumber = Number(first(searchParams.page) || "1");
  const page =
    Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 10000
      ? pageNumber
      : 1;

  const fail = (error: string): BrowseParams => ({
    form,
    query: null,
    error,
    page,
  });

  const category = form.category
    ? categories.find((option) => option.slug === form.category)
    : undefined;
  if (form.category && !category) return fail("That category doesn't exist.");

  const minPrice = form.min ? pesosToMinor(form.min) : undefined;
  const maxPrice = form.max ? pesosToMinor(form.max) : undefined;
  if (minPrice === null || maxPrice === null)
    return fail("Enter prices as numbers, for example 500 or 1250.50.");

  const result = querySchema.safeParse({
    q: form.q || undefined,
    categoryId: category?.id,
    minPrice,
    maxPrice,
    sort: form.sort,
    page,
    pageSize: PAGE_SIZE,
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    if (issue?.path[0] === "minPrice" && issue.code === "custom")
      return fail("The minimum price is higher than the maximum price.");
    if (issue?.path[0] === "q")
      return fail("Search for 100 characters or fewer.");
    return fail("Those filters can't be used. Try clearing them.");
  }
  return { form, query: result.data, error: null, page };
}

/** Builds a /listings URL from form values, dropping empty and default ones. */
export function browseHref(
  form: BrowseFormValues,
  overrides: Partial<BrowseFormValues & { page: number }> = {},
): string {
  const values = { ...form, ...overrides };
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.category) params.set("category", values.category);
  if (values.min) params.set("min", values.min);
  if (values.max) params.set("max", values.max);
  if (values.sort && values.sort !== "newest") params.set("sort", values.sort);
  if (overrides.page && overrides.page > 1)
    params.set("page", String(overrides.page));
  const query = params.toString();
  return query ? `/listings?${query}` : "/listings";
}
