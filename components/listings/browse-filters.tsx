import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SORT_OPTIONS,
  type BrowseFormValues,
  type CategoryOption,
} from "@/lib/search/browse-params";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

/**
 * A plain GET form: submitting it updates the URL, so every filter combination
 * is shareable and works without JavaScript. Changing filters resets to page 1
 * because the form has no page field.
 */
export function BrowseFilters({
  form,
  categories,
}: {
  form: BrowseFormValues;
  categories: CategoryOption[];
}) {
  const filtersActive = Boolean(
    form.category || form.min || form.max || form.sort !== "newest",
  );

  return (
    <form action="/listings" method="get" className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Label htmlFor="browse-q" className="sr-only">
          Search devices
        </Label>
        <Input
          id="browse-q"
          type="search"
          name="q"
          defaultValue={form.q}
          maxLength={100}
          placeholder="Search by name, e.g. drone"
          className="flex-1"
        />
        <Button type="submit">Search</Button>
      </div>

      <details
        open={filtersActive}
        className="rounded-lg border border-border bg-surface p-3"
      >
        <summary className="cursor-pointer text-sm font-medium text-fg">
          Filters and sort
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="browse-category">Category</Label>
            <select
              id="browse-category"
              name="category"
              defaultValue={form.category}
              className={selectClass}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="browse-min">Min price per day (₱)</Label>
            <Input
              id="browse-min"
              name="min"
              inputMode="decimal"
              defaultValue={form.min}
              placeholder="0"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="browse-max">Max price per day (₱)</Label>
            <Input
              id="browse-max"
              name="max"
              inputMode="decimal"
              defaultValue={form.max}
              placeholder="Any"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="browse-sort">Sort by</Label>
            <select
              id="browse-sort"
              name="sort"
              defaultValue={form.sort}
              className={selectClass}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit">Apply filters</Button>
          <Button asChild variant="ghost">
            <Link href="/listings">Clear all</Link>
          </Button>
        </div>
      </details>
    </form>
  );
}
