import Link from "next/link";
import { PageState } from "@/components/layout/page-state";
import { Button } from "@/components/ui/button";

export default function ReviewsNotFound() {
  return (
    <PageState
      title={<>We couldn&apos;t find that member</>}
      actions={
        <Button asChild>
          <Link href="/listings">Browse devices</Link>
        </Button>
      }
    >
      <p>
        They may have no reviews yet, or the link may be wrong. Reviews show up
        here after a completed rental.
      </p>
    </PageState>
  );
}
