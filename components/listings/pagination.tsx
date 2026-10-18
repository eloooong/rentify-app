import Link from "next/link";
import { Button } from "@/components/ui/button";
import { browseHref, type BrowseFormValues } from "@/lib/search/browse-params";

export function Pagination({
  form,
  page,
  totalPages,
}: {
  form: BrowseFormValues;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-border pt-4"
    >
      {page > 1 ? (
        <Button asChild variant="outline">
          <Link href={browseHref(form, { page: page - 1 })} rel="prev">
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
          <Link href={browseHref(form, { page: page + 1 })} rel="next">
            Next
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
