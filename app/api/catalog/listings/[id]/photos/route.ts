import { type NextRequest } from "next/server";
import { uploadPhoto } from "@/lib/catalog/handlers";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return uploadPhoto(request, (await context.params).id);
}
export const dynamic = "force-dynamic";
