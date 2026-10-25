import type { NextRequest } from "next/server";
import { openChat } from "@/lib/chat/handlers";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return openChat(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
