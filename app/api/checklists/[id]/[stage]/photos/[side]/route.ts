import type { NextRequest } from "next/server";
import { downloadEvidence, uploadEvidence } from "@/lib/checklists/handlers";

type Context = { params: Promise<{ id: string; stage: string; side: string }> };

export async function GET(request: NextRequest, context: Context) {
  return downloadEvidence(request, await context.params);
}

export async function POST(request: NextRequest, context: Context) {
  return uploadEvidence(request, await context.params);
}
