import { expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/route", () => ({ createRouteClient: vi.fn() }));
import { NextRequest, NextResponse } from "next/server";
import { api, jsonBody, limitedBody } from "./http";
it("caps actual streamed bytes instead of trusting Content-Length", async () => {
  await expect(
    limitedBody(
      new Request("http://localhost", {
        method: "POST",
        body: "large",
        headers: { "Content-Length": "1" },
      }),
      3,
    ),
  ).rejects.toMatchObject({ status: 413 });
});
it("rejects malformed JSON without echoing it", async () => {
  const request = new NextRequest("http://localhost", {
    method: "POST",
    body: "private malformed input",
    headers: { "Content-Type": "application/json" },
  });
  await expect(jsonBody(request)).rejects.toMatchObject({
    status: 400,
    code: "invalid_json",
  });
});
it("blocks cross-origin mutations before calling the database", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  try {
    const run = vi.fn(async () => NextResponse.json({ data: true }));
    const response = await api(
      new NextRequest("http://localhost:3000/api/catalog/listings", {
        method: "POST",
        headers: { Origin: "https://attacker.invalid" },
      }),
      run,
    );
    expect(response.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  } finally {
    vi.unstubAllEnvs();
  }
});
