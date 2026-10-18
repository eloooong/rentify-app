import { createHmac } from "node:crypto";
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
it("durably queues a signed event before acknowledging it, and returns 503 on persistence failure", async () => {
  vi.stubEnv("RENTIFY_PAYMENTS_ENABLED", "true");
  vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", "unit-webhook-secret");
  const raw = JSON.stringify({
    data: {
      id: "evt_fixture",
      type: "event",
      attributes: {
        type: "checkout_session.payment.paid",
        livemode: false,
        data: {
          id: "cs_fixture",
          type: "checkout_session",
          attributes: { reference_number: id, livemode: false },
        },
      },
    },
  });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", "unit-webhook-secret")
    .update(`${t}.${raw}`)
    .digest("hex");
  const call = () =>
    webhook(
      new NextRequest("http://localhost:3000/api/payments/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Paymongo-Signature": `t=${t},te=${sig},li=`,
        },
        body: raw,
      }),
    );
  mocks.adminRpc.mockResolvedValue({ data: true, error: null });
  expect((await call()).status).toBe(200);
  expect(mocks.adminRpc).toHaveBeenCalledWith(
    "enqueue_payment_event",
    expect.objectContaining({
      p_event: "evt_fixture",
      p_session: "cs_fixture",
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
