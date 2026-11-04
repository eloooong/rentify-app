"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookingProblemAlert } from "@/components/bookings/reason-dialog";
import { apiRequest } from "@/components/listings/api-request";
import { Button } from "@/components/ui/button";
import { conversationSchema } from "@/lib/chat/validation";
import { chatProblem, type ChatProblem } from "@/lib/listings/chat";

/** Opens this booking's conversation, creating it the first time. */
export function OpenChatButton({
  bookingId,
  label,
  returnTo,
}: {
  bookingId: string;
  label: string;
  returnTo: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<ChatProblem | null>(null);

  async function open() {
    setPending(true);
    setProblem(null);
    try {
      const result = await apiRequest(
        "POST",
        `/api/bookings/${bookingId}/conversation`,
        {},
      );
      const opened = conversationSchema.safeParse(
        (result.json as { data?: unknown } | null)?.data,
      );
      if (result.ok && opened.success) {
        router.push(`/messages/${opened.data.id}`);
        return;
      }
      setProblem(
        chatProblem(result.ok ? 503 : result.status, result.json, returnTo),
      );
    } catch {
      setProblem(chatProblem(0, null, returnTo));
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        className="w-full sm:w-fit"
        disabled={pending}
        onClick={() => void open()}
      >
        {pending ? "Opening…" : label}
      </Button>
      {problem && <BookingProblemAlert problem={problem} />}
    </div>
  );
}
