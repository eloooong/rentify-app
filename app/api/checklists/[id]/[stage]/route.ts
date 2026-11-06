import type { NextRequest } from "next/server";
import { confirmChecklist, getChecklist } from "@/lib/checklists/handlers";

type Context = { params: Promise<{ id: string; stage: string }> };

export async function GET(request: NextRequest, context: Context) {
  return getChecklist(request, await context.params);
}

export async function POST(request: NextRequest, context: Context) {
  return confirmChecklist(request, await context.params);
}
