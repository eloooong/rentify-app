import { type NextRequest } from "next/server";
import { detail, updateListing, deleteListing } from "@/lib/catalog/handlers";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  return detail(request, (await context.params).id);
}
export async function PATCH(request: NextRequest, context: Context) {
  return updateListing(request, (await context.params).id);
}
export async function DELETE(request: NextRequest, context: Context) {
  return deleteListing(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
