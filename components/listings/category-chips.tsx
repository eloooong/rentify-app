import Link from "next/link";
import {
  browseHref,
  type BrowseFormValues,
  type CategoryOption,
} from "@/lib/search/browse-params";

const chip =
  "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium focus-visible:outline-2";

export function CategoryChips({
  form,
  categories,
}: {
  form: BrowseFormValues;
  categories: CategoryOption[];
}) {
  const options = [{ slug: "", name: "All" }, ...categories];

  return (
    <nav aria-label="Categories">
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {options.map((option) => {
          const active = form.category === option.slug;
          return (
            <li key={option.slug || "all"} className="shrink-0">
              <Link
                href={browseHref(form, { category: option.slug })}
                aria-current={active ? "page" : undefined}
                className={`${chip} ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-fg hover:bg-surface-muted"
                }`}
              >
                {option.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
