import type { NextRequest } from "next/server";
import { bookingDetail } from "@/lib/bookings/handlers";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return bookingDetail(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
