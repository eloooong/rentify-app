import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  createRouteClient: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/route", () => ({
  createRouteClient: mocks.createRouteClient,
}));
import { handleAuthLink } from "./confirmation";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://rentify.example");
  mocks.createRouteClient.mockImplementation((_request, response) => {
    response.cookies.set("sb-test-auth-token", "session", {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
    });
    return {
      auth: {
        verifyOtp: mocks.verifyOtp,
        exchangeCodeForSession: mocks.exchangeCodeForSession,
      },
    };
  });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it.each(["", "?type=email", "?token_hash=abcdefghijklmnop&type=invite"])(
  "rejects malformed or unsupported confirmation links: %s",
  async (query) => {
    const response = await handleAuthLink(
      new NextRequest(`https://spoofed.example/auth/confirm${query}`),
      "confirm",
    );
    expect(response.headers.get("location")).toBe(
      "https://rentify.example/auth/error",
    );
    expect(mocks.createRouteClient).not.toHaveBeenCalled();
  },
);

it("keeps session cookies and private cache headers on a successful recovery redirect", async () => {
  mocks.verifyOtp.mockResolvedValue({ error: null });
  const response = await handleAuthLink(
    new NextRequest(
      "https://rentify.example/auth/confirm?token_hash=abcdefghijklmnop&type=recovery&next=https://evil.example",
    ),
    "confirm",
  );
  expect(response.headers.get("location")).toBe(
    "https://rentify.example/update-password",
  );
  expect(response.cookies.get("sb-test-auth-token")?.value).toBe("session");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

it("handles expired/replayed links without reflecting tokens in the redirect", async () => {
  mocks.verifyOtp.mockResolvedValue({ error: { message: "expired" } });
  const response = await handleAuthLink(
    new NextRequest(
      "https://rentify.example/auth/confirm?token_hash=abcdefghijklmnop&type=email",
    ),
    "confirm",
  );
  expect(response.headers.get("location")).toBe(
    "https://rentify.example/auth/error",
  );
});

it("supports PKCE and sanitizes callback return paths", async () => {
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  const response = await handleAuthLink(
    new NextRequest(
      "https://rentify.example/auth/callback?code=valid-code&next=//evil.example",
    ),
    "callback",
  );
  expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
  expect(response.headers.get("location")).toBe(
    "https://rentify.example/account",
  );
});
