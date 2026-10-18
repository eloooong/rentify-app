import { type NextRequest } from "next/server";
import { getPhoto, deletePhoto } from "@/lib/catalog/handlers";
type Context = { params: Promise<{ id: string; photoId: string }> };
export async function GET(request: NextRequest, context: Context) {
  const { id, photoId } = await context.params;
  return getPhoto(request, id, photoId);
}
export async function DELETE(request: NextRequest, context: Context) {
  const { id, photoId } = await context.params;
  return deletePhoto(request, id, photoId);
}
export const dynamic = "force-dynamic";
