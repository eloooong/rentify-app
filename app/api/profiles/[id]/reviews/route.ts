import type { NextRequest } from "next/server";
import { profileReviews } from "@/lib/reviews/handlers";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return profileReviews(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
