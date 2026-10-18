import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  client: { auth: { getUser: vi.fn() }, rpc: vi.fn() },
  createActionClient: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/action", () => ({
  createActionClient: mocks.createActionClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { saveProfile } from "./actions";
const idle = { status: "idle" as const };
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({
    displayName: "  Angel  ",
    phone: "+639171234567",
    ...extra,
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  mocks.createActionClient.mockResolvedValue(mocks.client);
  mocks.client.auth.getUser.mockResolvedValue({
    data: { user: { id: "verified-user", email_confirmed_at: "now" } },
    error: null,
  });
  mocks.client.rpc.mockResolvedValue({ error: null });
});
afterEach(() => vi.resetAllMocks());
it("validates direct action inputs before reaching Supabase", async () => {
  const result = await saveProfile(
    idle,
    form({ displayName: "", phone: "invalid" }),
  );
  expect(result.errors?.displayName).toBeDefined();
  expect(result.errors?.phone).toBeDefined();
  expect(mocks.createActionClient).not.toHaveBeenCalled();
});
it.each([null, { id: "unverified" }])(
  "rejects missing or unverified identity",
  async (user) => {
    mocks.client.auth.getUser.mockResolvedValue({
      data: { user },
      error: null,
    });
    expect((await saveProfile(idle, form())).status).toBe("error");
    expect(mocks.client.rpc).not.toHaveBeenCalled();
  },
);
it("rejects provider auth errors even if they include a user", async () => {
  mocks.client.auth.getUser.mockResolvedValue({
    data: { user: { email_confirmed_at: "now" } },
    error: { message: "internal" },
  });
  expect((await saveProfile(idle, form())).status).toBe("error");
  expect(mocks.client.rpc).not.toHaveBeenCalled();
});
it("passes only validated editable fields to the owner-scoped atomic RPC", async () => {
  expect(
    (
      await saveProfile(
        idle,
        form({
          id: "another-user",
          role: "admin",
          account_status: "active",
          phone_verified_at: "now",
        }),
      )
    ).status,
  ).toBe("success");
  expect(mocks.client.rpc).toHaveBeenCalledWith("save_my_profile", {
    p_display_name: "Angel",
    p_phone: "+639171234567",
  });
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/account");
});
it("hides database details and does not revalidate a failed save", async () => {
  mocks.client.rpc.mockResolvedValue({
    error: { message: "sensitive backend detail" },
  });
  const result = await saveProfile(idle, form());
  expect(result.status).toBe("error");
  expect(JSON.stringify(result)).not.toContain("sensitive backend detail");
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
it("omits a blank phone so the RPC clears it to NULL", async () => {
  expect((await saveProfile(idle, form({ phone: "" }))).status).toBe("success");
  expect(mocks.client.rpc).toHaveBeenCalledWith("save_my_profile", {
    p_display_name: "Angel",
  });
});
it("handles provider outages without claiming success", async () => {
  mocks.client.rpc.mockRejectedValue(new Error("unavailable"));
  expect((await saveProfile(idle, form())).status).toBe("error");
});
