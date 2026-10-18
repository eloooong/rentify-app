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
import { bookingRefunds, reconcileRefunds } from "./refund-handlers";
const id = "a1000000-0000-4000-8000-000000000001";
const summary = {
  booking_id: id,
  currency: "PHP",
  test_mode: true,
  can_cancel_paid: false,
  refund_due_amount: 0,
  refund_pending_amount: 0,
  refunded_amount: 0,
  review_required: false,
  attempts: [],
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function request(
  method = "GET",
  body?: unknown,
  origin = "http://localhost:3000",
) {
  return new NextRequest(`http://localhost:3000/api/bookings/${id}/refunds`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function signedIn() {
  mocks.getUser.mockResolvedValue({
    data: { user: { email_confirmed_at: "2026-01-01" } },
    error: null,
  });
}
it("requires a verified identity and keeps even errors private", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  const r = await bookingRefunds(request(), id);
  expect(r.status).toBe(401);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("reads safe participant status without requiring configured PayMongo", async () => {
  signedIn();
  mocks.rpc.mockResolvedValue({ data: summary, error: null });
  const r = await bookingRefunds(request(), id);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ data: summary });
});
it("rejects arbitrary amounts, identities, success flags and invalid reasons", async () => {
  signedIn();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  for (const body of [
    { reason: "okay", amount: 1 },
    { reason: "okay", state: "succeeded" },
    { reason: "x" },
    { reason: "bad\nreason" },
    { reason: "okay", actor_id: id },
  ])
    expect((await bookingRefunds(request("POST", body), id)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects cross-origin cancellation before writes", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  expect(
    (
      await bookingRefunds(
        request("POST", { reason: "Changed plans" }, "https://evil.example"),
        id,
      )
    ).status,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("maps closed and outsider errors without exposing private SQL", async () => {
  signedIn();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "P0001", message: "paid_cancellation_closed" },
  });
  expect(
    (await bookingRefunds(request("POST", { reason: "Changed plans" }), id))
      .status,
  ).toBe(409);
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "P0001", message: "not_found" },
  });
  expect((await bookingRefunds(request(), id)).status).toBe(404);
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "XX000", message: "private SQL" },
  });
  expect(await (await bookingRefunds(request(), id)).text()).not.toContain(
    "private SQL",
  );
});
it("requires worker bearer authorization and separate refund opt-in", async () => {
  expect((await reconcileRefunds(request("POST"))).status).toBe(403);
  vi.stubEnv(
    "PAYMENTS_WORKER_SECRET",
    "unit-worker-secret-with-at-least-thirty-two-characters",
  );
  vi.stubEnv("RENTIFY_PAYMENTS_ENABLED", "true");
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_unit");
  vi.stubEnv("RENTIFY_REFUNDS_ENABLED", "false");
  const r = new NextRequest(
    "http://localhost:3000/api/payments/refunds/reconcile",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYMENTS_WORKER_SECRET}`,
      },
    },
  );
  expect((await reconcileRefunds(r)).status).toBe(503);
  expect(mocks.adminRpc).not.toHaveBeenCalled();
  vi.stubEnv("RENTIFY_REFUNDS_ENABLED", "true");
  mocks.adminRpc.mockResolvedValue({ data: [], error: null });
  const ok = await reconcileRefunds(r);
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ claimed: 0, completed: 0 });
});
