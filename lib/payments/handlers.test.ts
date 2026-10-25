import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
}));
vi.mock("@/lib/supabase/route", () => ({
  createRouteClient: () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.adminRpc }),
}));
import { checkout, reconcile, webhook } from "./handlers";
const id = "a1000000-0000-4000-8000-000000000001";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function request(
  method = "GET",
  body?: unknown,
  origin = "http://localhost:3000",
) {
  return new NextRequest(`http://localhost:3000/api/bookings/${id}/checkout`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
it("requires verified sessions before any private checkout read", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  const response = await checkout(request(), id);
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects cross-origin checkout before recording consent", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  expect(
    (
      await checkout(
        request(
          "POST",
          { policy_version: "demo-payments-v1" },
          "https://evil.example",
        ),
        id,
      )
    ).status,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects browser prices and fails closed without provider configuration", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("RENTIFY_PAYMENTS_ENABLED", "false");
  mocks.getUser.mockResolvedValue({
    data: { user: { email_confirmed_at: "2026-01-01" } },
    error: null,
  });
  expect(
    (
      await checkout(
        request("POST", { policy_version: "demo-payments-v1", amount: 1 }),
        id,
      )
    ).status,
  ).toBe(400);
  const response = await checkout(
    request("POST", { policy_version: "demo-payments-v1" }),
    id,
  );
  expect(response.status).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("denies worker requests without the server bearer secret", async () => {
  vi.stubEnv(
    "PAYMENTS_WORKER_SECRET",
    "unit-worker-secret-longer-than-thirty-two",
  );
  expect(
    (
      await reconcile(
        new NextRequest("http://localhost:3000/api/payments/reconcile", {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(403);
  expect(mocks.adminRpc).not.toHaveBeenCalled();
});
it("durably queues authenticated Xendit callbacks before acknowledgement", async () => {
  vi.stubEnv("RENTIFY_PAYMENTS_ENABLED", "true");
  vi.stubEnv("XENDIT_WEBHOOK_TOKEN", "unit-webhook-token");
  const raw = JSON.stringify({
    event: "payment_session.completed",
    business_id: "business",
    data: {
      payment_session_id: "ps-661f87c614802d6c402cd82d",
      reference_id: id,
      business_id: "business",
      session_type: "PAY",
      country: "PH",
      currency: "PHP",
      mode: "PAYMENT_LINK",
    },
  });
  const call = () =>
    webhook(
      new NextRequest("http://localhost:3000/api/payments/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-callback-token": "unit-webhook-token",
        },
        body: raw,
      }),
    );
  mocks.adminRpc.mockResolvedValue({ data: true, error: null });
  expect((await call()).status).toBe(200);
  expect(mocks.adminRpc).toHaveBeenCalledWith(
    "enqueue_payment_event",
    expect.objectContaining({
      p_event: expect.stringMatching(/^xevt_[a-f0-9]{64}$/),
      p_session: "ps-661f87c614802d6c402cd82d",
      p_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
  mocks.adminRpc.mockResolvedValue({
    data: null,
    error: { message: "private SQL" },
  });
  const response = await call();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private SQL");
});
it("checks HTTPS provider-return configuration before persisting a checkout attempt", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("RENTIFY_PAYMENTS_ENABLED", "true");
  vi.stubEnv("XENDIT_SECRET_KEY", "xnd_development_unit");
  vi.stubEnv("XENDIT_RETURN_ORIGIN", "");
  mocks.getUser.mockResolvedValue({
    data: { user: { email_confirmed_at: "now" } },
    error: null,
  });
  expect(
    (
      await checkout(
        request("POST", { policy_version: "demo-payments-v1" }),
        id,
      )
    ).status,
  ).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
