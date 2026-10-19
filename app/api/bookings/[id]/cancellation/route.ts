import type { NextRequest } from "next/server";
import { bookingRefunds } from "@/lib/payments/refund-handlers";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return bookingRefunds(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
