import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnvironment } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("Supabase public configuration", () => {
  it.each([
    [undefined, "public-test-key"],
    ["http://127.0.0.1:54321", undefined],
  ])("rejects incomplete configuration without exposing values", (url, key) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
    expect(getSupabaseEnvironment).toThrow(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local before using Supabase.",
    );
  });
});
