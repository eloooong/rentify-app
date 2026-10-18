import { afterEach, expect, it, vi } from "vitest";
import { authCookieOptions, getAppOrigin } from "./config";
afterEach(() => vi.unstubAllEnvs());

it.each([
  undefined,
  "javascript:alert(1)",
  "https://user:password@rentify.example",
  "https://rentify.example/path",
  "https://rentify.example?next=x",
  "http://rentify.example",
])("rejects unsafe or incomplete application origins: %s", (value) => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", value);
  expect(getAppOrigin).toThrow();
});

it("supports local HTTP and secure hosted cookie settings", () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  expect(getAppOrigin()).toBe("http://localhost:3000");
  expect(authCookieOptions().secure).toBe(false);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://rentify.example/");
  expect(getAppOrigin()).toBe("https://rentify.example");
  expect(authCookieOptions().secure).toBe(true);
});
