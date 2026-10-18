import type { NextRequest } from "next/server";
import { handleAuthLink } from "@/lib/auth/confirmation";

export async function GET(request: NextRequest) {
  return handleAuthLink(request, "confirm");
}
