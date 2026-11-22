import Link from "next/link";
import { PageState } from "@/components/layout/page-state";
import { Button } from "@/components/ui/button";

export default function CheckoutNotFound() {
  return (
    <PageState
      title={<>We couldn&apos;t find that booking</>}
      actions={
        <Button asChild>
          <Link href="/bookings">Go to your bookings</Link>
        </Button>
      }
    >
      <p>
        It may belong to another account, or the link may be wrong. You can only
        see bookings you&apos;re part of.
      </p>
    </PageState>
  );
}
