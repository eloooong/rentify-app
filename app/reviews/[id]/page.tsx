import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingSummary } from "@/components/reviews/rating-summary";
import { ReviewCard } from "@/components/reviews/review-card";
import { Button } from "@/components/ui/button";
import {
  ROLE_FILTERS,
  emptyReviewsText,
  parseReviewsView,
  reviewsHref,
  reviewsTotalPages,
  type ReviewsView,
} from "@/lib/listings/reviews";
import {
  getProfileReviews,
  getPublicProfile,
  getRatingSummary,
} from "@/lib/listings/reviews-server";
import { reviewId } from "@/lib/reviews/validation";

export const metadata: Metadata = {
  title: "Reviews | Rentify",
  robots: { index: false, follow: false },
};

/**
 * A member's public reviews (A3.3): the summary for the chosen role, a role
 * filter and a page of reviews, newest first. Public: no account needed.
 */
export default async function ProfileReviewsPage(
  props: PageProps<"/reviews/[id]">,
) {
  const [{ id }, params] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  if (!reviewId.safeParse(id).success) notFound();
  const view = parseReviewsView(params);
  const [profile, page] = await Promise.all([
    getPublicProfile(id),
    getProfileReviews(id, view),
  ]);
  // Reviews outlive a suspended profile, but an unknown ID shows nothing.
  if (!profile && page.summary.count === 0) {
    const overall = view.role ? await getRatingSummary(id) : page.summary;
    if (!overall || overall.count === 0) notFound();
  }

  const name = profile?.displayName ?? null;
  const totalPages = reviewsTotalPages(page.pagination.total);
  const since =
    profile &&
    new Intl.DateTimeFormat("en-PH", {
      month: "long",
      year: "numeric",
    }).format(new Date(profile.memberSince));
  const href = (next: Partial<ReviewsView>) =>
    reviewsHref(id, { ...view, ...next });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-fg sm:text-3xl">
          {name ? `Reviews for ${name}` : "Member reviews"}
        </h1>
        {since && (
          <p className="text-sm text-muted-foreground">Member since {since}</p>
        )}
        <RatingSummary summary={page.summary} size="lg" />
      </div>

      <nav aria-label="Filter reviews" className="flex flex-wrap gap-2">
        {ROLE_FILTERS.map((filter) => {
          const current = filter.role === view.role;
          return (
            <Button
              key={filter.label}
              asChild
              size="lg"
              variant={current ? "default" : "outline"}
              className="min-h-11"
            >
              <Link
                href={href({ role: filter.role, page: 1 })}
                aria-current={current ? "true" : undefined}
              >
                {filter.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      <section
        aria-labelledby="reviews-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="reviews-heading" className="sr-only">
          Reviews
        </h2>
        {page.data.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {page.data.map((review) => (
              <li key={review.id}>
                <ReviewCard review={review} />
              </li>
            ))}
          </ul>
        ) : page.pagination.total > 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4">
            <p>This page is past the last review.</p>
            <Button asChild variant="outline" size="lg" className="min-h-11">
              <Link href={href({ page: 1 })}>Go to the first page</Link>
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-border p-4 text-muted-foreground">
            {emptyReviewsText(view.role)}
          </p>
        )}
      </section>

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-3 border-t border-border pt-4"
        >
          {view.page > 1 ? (
            <Button asChild variant="outline" size="lg" className="min-h-11">
              <Link href={href({ page: view.page - 1 })} rel="prev">
                Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <p className="text-sm text-muted-foreground">
            Page {Math.min(view.page, totalPages)} of {totalPages}
          </p>
          {view.page < totalPages ? (
            <Button asChild variant="outline" size="lg" className="min-h-11">
              <Link href={href({ page: view.page + 1 })} rel="next">
                Next
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
