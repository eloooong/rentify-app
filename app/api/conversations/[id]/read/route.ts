import type { NextRequest } from "next/server";
import { markRead } from "@/lib/chat/handlers";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return markRead(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
