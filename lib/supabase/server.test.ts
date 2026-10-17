import { afterEach, expect, it, vi } from "vitest";

const { cookies, createServerClient } = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { createClient } from "./server";

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it("isolates request cookies and never writes cookies during component rendering", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  const first = {
    getAll: () => [{ name: "session", value: "first" }],
    set: vi.fn(),
  };
  const second = {
    getAll: () => [{ name: "session", value: "second" }],
    set: vi.fn(),
  };
  cookies.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

  await createClient();
  await createClient();

  const firstAdapter = createServerClient.mock.calls[0][2].cookies;
  const secondAdapter = createServerClient.mock.calls[1][2].cookies;
  expect(firstAdapter.getAll()).toEqual([{ name: "session", value: "first" }]);
  expect(secondAdapter.getAll()).toEqual([
    { name: "session", value: "second" },
  ]);
  firstAdapter.setAll([{ name: "session", value: "refresh", options: {} }], {});
  expect(first.set).not.toHaveBeenCalled();
  expect(second.set).not.toHaveBeenCalled();
});
