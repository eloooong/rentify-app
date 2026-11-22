"use client";

import Link from "next/link";
import { PageState } from "@/components/layout/page-state";
import { Button } from "@/components/ui/button";

// Shown when a page in this section fails to load (provider or network
// failure). Missing records use the nearest not-found.tsx instead.
export default function OwnerError({ retry }: { retry: () => void }) {
  return (
    <PageState
      alert
      title={<>We couldn&apos;t load this page</>}
      actions={
        <>
          <Button onClick={retry}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/listings">Browse devices</Link>
          </Button>
        </>
      }
    >
      <p>Your listings are unchanged. Please try again in a moment.</p>
    </PageState>
  );
}
