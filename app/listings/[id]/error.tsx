"use client";

import { PageState } from "@/components/layout/page-state";
import { Button } from "@/components/ui/button";

// Shown when the listing could not be loaded (provider or network failure).
// A missing or unpublished listing uses not-found.tsx instead.
export default function ListingError({ retry }: { retry: () => void }) {
  return (
    <PageState
      alert
      title={<>We couldn&apos;t load this listing</>}
      actions={<Button onClick={retry}>Try again</Button>}
    >
      <p>Please try again in a moment.</p>
    </PageState>
  );
}
