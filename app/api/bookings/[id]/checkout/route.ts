import type { NextRequest } from "next/server";
import { checkout } from "@/lib/payments/handlers";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return checkout(request, (await context.params).id);
}
export const POST = GET;
export const dynamic = "force-dynamic";
