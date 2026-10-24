import { Badge } from "@/components/ui/badge";
import {
  STATUS_LABEL,
  STATUS_TONE,
  type BookingStatus,
} from "@/lib/listings/booking-status";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  action: "bg-surface-tint text-brand-strong",
  active: "bg-secondary text-secondary-foreground",
  closed: "border-border bg-transparent text-muted-foreground",
  problem: "bg-destructive/10 text-destructive",
} as const;

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge className={cn(TONE_CLASS[STATUS_TONE[status]])}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
