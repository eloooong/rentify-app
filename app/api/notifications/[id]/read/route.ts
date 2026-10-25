import type { NextRequest } from "next/server";
import { readNotification } from "@/lib/notifications/handlers";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return readNotification(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
