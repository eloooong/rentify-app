import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieMethodsServer } from "@supabase/ssr";

const { createServerClient, getUser } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
import { updateSession } from "./proxy";

const verified = { id: "user-1", email_confirmed_at: "2026-10-18T00:00:00Z" };
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  createServerClient.mockReturnValue({ auth: { getUser } });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it("redirects anonymous requests to sign in with a safe local return path", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  const response = await updateSession(
    new NextRequest("https://rentify.example/owner/listings/new?tab=draft"),
  );
  expect(response.status).toBe(303);
  const location = new URL(response.headers.get("location")!);
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("next")).toBe(
    "/owner/listings/new?tab=draft",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("does not trust a forged cookie or an unverified identity", async () => {
  getUser.mockResolvedValueOnce({
    data: { user: null },
    error: { status: 401 },
  });
  const forged = new NextRequest("https://rentify.example/account", {
    headers: { cookie: "sb-project-auth-token=forged" },
  });
  expect((await updateSession(forged)).status).toBe(303);
  expect(getUser).toHaveBeenCalledOnce();
  getUser.mockResolvedValueOnce({
    data: { user: { id: "unverified", email_confirmed_at: null } },
    error: null,
  });
  expect(
    (await updateSession(new NextRequest("https://rentify.example/account")))
      .status,
  ).toBe(303);
});

it("forwards refreshed cookies into the request and response, including redirect responses", async () => {
  const request = new NextRequest("https://rentify.example/account");
  getUser.mockImplementation(async () => {
    const adapter = createServerClient.mock.calls[0][2]
      .cookies as CookieMethodsServer;
    await adapter.setAll!(
      [
        {
          name: "sb-project-auth-token",
          value: "refreshed",
          options: { path: "/", secure: true, sameSite: "lax" },
        },
      ],
      { "Cache-Control": "private, no-store", Expires: "0" },
    );
    return { data: { user: null }, error: null };
  });
  const response = await updateSession(request);
  expect(request.cookies.get("sb-project-auth-token")?.value).toBe("refreshed");
  expect(response.cookies.get("sb-project-auth-token")?.value).toBe(
    "refreshed",
  );
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("cache-control")).toContain("private");
  expect(response.headers.get("expires")).toBe("0");
  expect(response.status).toBe(303);
});

it("allows a verified account and rejects all premature administration access", async () => {
  getUser.mockResolvedValue({
    data: { user: { ...verified, user_metadata: { role: "admin" } } },
    error: null,
  });
  expect(
    (await updateSession(new NextRequest("https://rentify.example/account")))
      .status,
  ).toBe(200);
  expect(
    (await updateSession(new NextRequest("https://rentify.example/admin")))
      .status,
  ).toBe(403);
});

it("denies an errored identity result even if a user object is present", async () => {
  getUser.mockResolvedValue({
    data: { user: verified },
    error: { status: 401 },
  });
  expect(
    (await updateSession(new NextRequest("https://rentify.example/account")))
      .status,
  ).toBe(303);
});

it("fails closed on auth outages without redirecting users into a false signed-out state", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
  const response = await updateSession(
    new NextRequest("https://rentify.example/account"),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("keeps public pages usable without credentials and rejects protected pages", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  expect(
    (await updateSession(new NextRequest("https://rentify.example/"))).status,
  ).toBe(200);
  expect(
    (await updateSession(new NextRequest("https://rentify.example/account")))
      .status,
  ).toBe(503);
  expect(createServerClient).not.toHaveBeenCalled();
});
