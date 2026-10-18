import type { NextRequest } from "next/server";
import { bookingAction } from "@/lib/bookings/handlers";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return bookingAction(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
