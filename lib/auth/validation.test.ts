import { describe, expect, it } from "vitest";
import {
  emailSchema,
  isProtectedPath,
  loginSchema,
  passwordSchema,
  safeReturnPath,
  signupSchema,
} from "./validation";

describe("server auth validation", () => {
  it("validates email and password limits without trimming passwords", () => {
    expect(emailSchema.parse({ email: "  owner@example.test " }).email).toBe(
      "owner@example.test",
    );
    expect(emailSchema.safeParse({ email: "invalid" }).success).toBe(false);
    expect(
      signupSchema.safeParse({ email: "a@example.test", password: "short" })
        .success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({
        email: "a@example.test",
        password: "x".repeat(129),
      }).success,
    ).toBe(false);
    expect(
      signupSchema.parse({ email: "a@example.test", password: " passphrase " })
        .password,
    ).toBe(" passphrase ");
    expect(
      loginSchema.safeParse({ email: "a@example.test", password: "legacy" })
        .success,
    ).toBe(true);
    expect(
      passwordSchema.safeParse({
        password: "new-password",
        confirmPassword: "different",
      }).success,
    ).toBe(false);
  });
});

describe("return URL boundary", () => {
  it.each([
    undefined,
    null,
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2fevil.example",
    "/account%0aLocation:x",
    "/account/%5cevil",
    "/login",
    "/auth/confirm",
    "/account/%ZZ",
  ])("rejects an unsafe return value: %s", (value) => {
    expect(safeReturnPath(value)).toBe("/account");
  });
  it.each([
    "/account",
    "/owner/listings/new",
    "/bookings?tab=hosting",
    "/messages/thread-1",
  ])("keeps a local protected return path: %s", (value) => {
    expect(safeReturnPath(value)).toBe(value);
  });
  it("matches whole route segments", () => {
    expect(isProtectedPath("/owner/listings/new")).toBe(true);
    expect(isProtectedPath("/ownership")).toBe(false);
    expect(isProtectedPath("/listings")).toBe(false);
  });
});
