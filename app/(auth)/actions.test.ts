import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  client: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      resend: vi.fn(),
      getUser: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
  createActionClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/action", () => ({
  createActionClient: mocks.createActionClient,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import {
  requestPasswordReset,
  resendVerification,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "./actions";

const idle = { status: "idle" as const };
function form(values: Record<string, string>) {
  const result = new FormData();
  Object.entries(values).forEach(([name, value]) => result.set(name, value));
  return result;
}
beforeEach(() => {
  mocks.createActionClient.mockResolvedValue(mocks.client);
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`redirect:${path}`);
  });
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it("rejects invalid direct action inputs before calling the provider", async () => {
  const result = await signUp(
    idle,
    form({ email: "invalid", password: "short" }),
  );
  expect(result.errors?.email).toBeDefined();
  expect(result.errors?.password).toBeDefined();
  expect(mocks.createActionClient).not.toHaveBeenCalled();
});

it("uses generic login errors and does not echo secrets or provider details", async () => {
  mocks.client.auth.signInWithPassword.mockResolvedValue({
    data: { user: null },
    error: { message: "internal detail" },
  });
  const result = await signIn(
    idle,
    form({ email: "owner@example.test", password: "secret-password" }),
  );
  expect(result.status).toBe("error");
  expect(JSON.stringify(result)).not.toMatch(/secret-password|internal detail/);
});

it("redirects successful logins only to a safe local target", async () => {
  mocks.client.auth.signInWithPassword.mockResolvedValue({
    data: { user: { email_confirmed_at: "now" } },
    error: null,
  });
  await expect(
    signIn(
      idle,
      form({
        email: "owner@example.test",
        password: "valid-password",
        next: "https://evil.example",
      }),
    ),
  ).rejects.toThrow("redirect:/account");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
});

it("never accepts role/profile fields at signup and gives existing accounts the same response", async () => {
  mocks.client.auth.signUp
    .mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ error: { code: "user_already_exists" } });
  const values = form({
    email: "owner@example.test",
    password: "valid-password",
    role: "admin",
  });
  expect(await signUp(idle, values)).toEqual(await signUp(idle, values));
  expect(mocks.client.auth.signUp.mock.calls[0][0]).toEqual({
    email: "owner@example.test",
    password: "valid-password",
    options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
  });
});

it("uses configured origins and generic email responses", async () => {
  mocks.client.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.client.auth.resend.mockResolvedValue({ error: null });
  expect(
    (await requestPasswordReset(idle, form({ email: "unknown@example.test" })))
      .status,
  ).toBe("success");
  expect(mocks.client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
    "unknown@example.test",
    { redirectTo: "http://localhost:3000/auth/callback?next=/update-password" },
  );
  expect(
    (await resendVerification(idle, form({ email: "owner@example.test" })))
      .status,
  ).toBe("success");
});

it("checks identity server-side before password changes", async () => {
  mocks.client.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: null,
  });
  const result = await updatePassword(
    idle,
    form({ password: "new-password", confirmPassword: "new-password" }),
  );
  expect(result.status).toBe("error");
  expect(mocks.client.auth.updateUser).not.toHaveBeenCalled();
});

it("rejects mismatched passwords and signs out all sessions after a verified change", async () => {
  expect(
    (
      await updatePassword(
        idle,
        form({ password: "new-password", confirmPassword: "different" }),
      )
    ).errors?.confirmPassword,
  ).toBeDefined();
  mocks.client.auth.getUser.mockResolvedValue({
    data: { user: { email_confirmed_at: "now" } },
    error: null,
  });
  mocks.client.auth.updateUser.mockResolvedValue({ error: null });
  mocks.client.auth.signOut.mockResolvedValue({ error: null });
  await expect(
    updatePassword(
      idle,
      form({ password: "new-password", confirmPassword: "new-password" }),
    ),
  ).rejects.toThrow("redirect:/login?notice=password-updated");
  expect(mocks.client.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
});

it("reports logout failures instead of claiming success", async () => {
  mocks.client.auth.signOut.mockResolvedValue({
    error: { message: "failure" },
  });
  expect((await signOut()).status).toBe("error");
  expect(mocks.redirect).not.toHaveBeenCalled();
});
