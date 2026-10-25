import type { NextRequest } from "next/server";
import { messages, sendMessage } from "@/lib/chat/handlers";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  return messages(request, (await context.params).id);
}
export async function POST(request: NextRequest, context: Context) {
  return sendMessage(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
