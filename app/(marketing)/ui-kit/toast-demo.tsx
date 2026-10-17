"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

export function ToastDemo() {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => toast.success("Booking request sent")}
        >
          Success toast
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.error("Payment failed. Try again.")}
        >
          Error toast
        </Button>
      </div>
      <Toaster />
    </>
  );
}
