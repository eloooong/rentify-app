import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/chat/validation";
import { formatManilaTime } from "@/lib/listings/booking-status";
import type { OutgoingMessage } from "@/lib/listings/chat";
import { cn } from "@/lib/utils";

const BODY_CLASS =
  "rounded-lg px-3 py-2 break-words whitespace-pre-wrap text-fg";

/** One stored message. The body is plain text; React escapes it. */
export function MessageBubble({
  message,
  own,
  counterpart,
}: {
  message: ChatMessage;
  own: boolean;
  counterpart: string;
}) {
  return (
    <li
      className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}
    >
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-fg">{own ? "You" : counterpart}</span>
        {" · "}
        <time dateTime={message.created_at}>
          {formatManilaTime(message.created_at)}
        </time>
        {own && ` · ${message.read_at ? "Read" : "Sent"}`}
      </p>
      <p
        className={cn(
          BODY_CLASS,
          "max-w-[85%] sm:max-w-[70%]",
          own ? "bg-surface-tint" : "bg-surface-muted",
        )}
      >
        {message.body}
      </p>
    </li>
  );
}

/** A send that isn't confirmed. A failed one stays until retried or discarded. */
export function OutgoingBubble({
  item,
  onRetry,
  onEdit,
  onDiscard,
}: {
  item: OutgoingMessage;
  onRetry: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}) {
  const problem = item.problem;
  return (
    <li className="flex flex-col items-end gap-1">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-fg">You</span>
        {" · "}
        {item.status === "sending" ? (
          "Sending…"
        ) : (
          <span className="font-medium text-destructive">Not sent</span>
        )}
      </p>
      <p
        className={cn(
          BODY_CLASS,
          "max-w-[85%] sm:max-w-[70%]",
          item.status === "failed"
            ? "border border-destructive bg-surface"
            : "bg-surface-tint opacity-70",
        )}
      >
        {item.body}
      </p>
      {problem && (
        <div className="flex max-w-[85%] flex-col items-end gap-2 text-right sm:max-w-[70%]">
          <p className="text-sm text-destructive">{problem.message}</p>
          <div className="flex flex-wrap justify-end gap-2">
            {problem.action && (
              <Button asChild variant="outline" size="lg">
                <Link href={problem.action.href}>{problem.action.label}</Link>
              </Button>
            )}
            {problem.retry && (
              <Button size="lg" onClick={onRetry}>
                Retry
              </Button>
            )}
            {problem.kind === "conflict" || problem.kind === "invalid" ? (
              <Button variant="outline" size="lg" onClick={onEdit}>
                Edit message
              </Button>
            ) : (
              <Button variant="ghost" size="lg" onClick={onDiscard}>
                Discard
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
