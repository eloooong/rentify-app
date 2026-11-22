import Link from "next/link";
import { PageState } from "@/components/layout/page-state";
import { Button } from "@/components/ui/button";

export default function OwnerListingNotFound() {
  return (
    <PageState
      title={<>We couldn&apos;t find that listing</>}
      actions={
        <Button asChild>
          <Link href="/owner/listings">Go to my listings</Link>
        </Button>
      }
    >
      <p>
        It may have been removed, or it may belong to another account. You can
        only edit your own listings.
      </p>
    </PageState>
  );
}
