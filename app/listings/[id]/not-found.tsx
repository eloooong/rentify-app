import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ListingNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold text-fg">
        This listing isn&apos;t available
      </h1>
      <p>
        It may have been paused or removed by its owner, or the link may be
        wrong.
      </p>
      <Button asChild className="mt-2">
        <Link href="/listings">Browse other devices</Link>
      </Button>
    </div>
  );
}
