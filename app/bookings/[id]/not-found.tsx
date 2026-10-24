import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function BookingNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold text-fg">
        We couldn&apos;t find that booking
      </h1>
      <p>
        It may belong to another account, or the link may be wrong. You can only
        see bookings you&apos;re part of.
      </p>
      <Button asChild className="mt-2">
        <Link href="/bookings">Go to your bookings</Link>
      </Button>
    </div>
  );
}
