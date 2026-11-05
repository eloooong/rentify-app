import type { NextRequest } from "next/server";
import { bookingReview, submitReview } from "@/lib/reviews/handlers";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  return bookingReview(request, (await context.params).id);
}
export async function POST(request: NextRequest, context: Context) {
  return submitReview(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
