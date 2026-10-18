import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { CookieMethodsServer } from "@supabase/ssr";
const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  cookies: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
import { createActionClient } from "./action";
import { createRouteClient } from "./route";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://rentify.example");
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it("writes all action cookies, and propagates cookie-write failures", async () => {
  const set = vi.fn();
  mocks.cookies.mockResolvedValue({ getAll: () => [], set });
  await createActionClient();
  const options = mocks.createServerClient.mock.calls[0][2];
  const adapter = options.cookies as CookieMethodsServer;
  const values = [0, 1].map((index) => ({
    name: `sb-auth-token.${index}`,
    value: `chunk-${index}`,
    options: { path: "/", sameSite: "lax" as const },
  }));
  adapter.setAll!(values, {});
  expect(set).toHaveBeenCalledTimes(2);
  expect(options.cookieOptions.secure).toBe(true);
  set.mockImplementation(() => {
    throw new Error("read-only context");
  });
  expect(() => adapter.setAll!(values, {})).toThrow("read-only context");
});

it("keeps route-handler cookie attributes and refresh cache headers", () => {
  const request = new NextRequest("https://rentify.example/auth/callback");
  const response = NextResponse.redirect("https://rentify.example/account");
  createRouteClient(request, response);
  const adapter = mocks.createServerClient.mock.calls[0][2]
    .cookies as CookieMethodsServer;
  adapter.setAll!(
    [
      {
        name: "sb-auth-token",
        value: "session",
        options: { path: "/", secure: true, sameSite: "lax", maxAge: 120 },
      },
    ],
    { "Cache-Control": "private, no-store", Expires: "0" },
  );
  expect(response.cookies.get("sb-auth-token")?.value).toBe("session");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=120");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
