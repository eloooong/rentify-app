import type { Metadata } from "next";
import Link from "next/link";
import { PageState } from "@/components/layout/page-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found | Rentify",
};

// Any URL that matches no route, and notFound() calls without a nearer
// not-found.tsx.
export default function NotFound() {
  return (
    <PageState
      title={<>We couldn&apos;t find that page</>}
      actions={
        <>
          <Button asChild>
            <Link href="/listings">Browse devices</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/help">Visit the help center</Link>
          </Button>
        </>
      }
    >
      <p>The link may be wrong, or the page may have moved.</p>
    </PageState>
  );
}
