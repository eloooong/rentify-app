import { expect, it, vi } from "vitest";
import { runPaymentWork, type PaymentClient } from "./work";
import { ProviderError, type PaymentProvider, type Snapshot } from "./provider";
const id = "a1000000-0000-4000-8000-000000000001";
const snapshot: Snapshot = {
  session_id: "ps-661f87c614802d6c402cd82d",
  reference: id,
  checkout_url: "https://dev.xen.to/fixture",
  status: "active",
  livemode: false,
  payments: [],
};
function fixture(closed = false, overrides: Record<string, unknown> = {}) {
  const job = {
    id,
    booking_id: id,
    lease_token: id,
    session_id: "ps-661f87c614802d6c402cd82d",
    candidate_session_id: null,
    creation_started_at: null,
    rental_amount: 10000,
    deposit_amount: 10000,
    ...overrides,
  };
  const rpc = vi.fn(async (name: string) => ({
    data:
      name === "claim_payment_work"
        ? [job]
        : name === "checkout_can_pay"
          ? !closed
          : name === "sync_checkout"
            ? "open"
            : null,
    error: null,
  }));
  const admin = {
    rpc,
  } as unknown as PaymentClient;
  const provider: PaymentProvider = {
    create: vi.fn().mockResolvedValue(snapshot),
    retrieve: vi.fn().mockResolvedValue(snapshot),
    expire: vi.fn().mockResolvedValue(undefined),
  };
  return { job, rpc, admin, provider };
}
it("uses one leased job and the stored session, avoiding another checkout creation", async () => {
  const f = fixture();
  expect(
    await runPaymentWork(f.admin, f.provider, "http://localhost:3000"),
  ).toEqual({ claimed: 1, completed: 1 });
  expect(f.rpc.mock.calls[0]).toEqual(["claim_payment_work", { p_limit: 1 }]);
  expect(f.provider.create).not.toHaveBeenCalled();
  expect(f.provider.retrieve).toHaveBeenCalledWith(
    "ps-661f87c614802d6c402cd82d",
  );
});
it("persists transient failures for another reconciliation attempt", async () => {
  const f = fixture();
  vi.mocked(f.provider.retrieve).mockRejectedValue(
    new ProviderError("provider_unavailable"),
  );
  expect(
    await runPaymentWork(f.admin, f.provider, "http://localhost:3000"),
  ).toMatchObject({ completed: 0 });
  expect(f.rpc).toHaveBeenLastCalledWith("fail_payment_work", {
    p_attempt: id,
    p_lease: id,
    p_code: "provider_unavailable",
  });
});
it("re-reads when expiry rejects an ongoing payment, without creating a replacement", async () => {
  const f = fixture(true);
  vi.mocked(f.provider.expire).mockRejectedValue(
    new ProviderError("provider_unavailable"),
  );
  await runPaymentWork(f.admin, f.provider, "http://localhost:3000");
  expect(f.provider.retrieve).toHaveBeenCalledTimes(2);
  expect(f.provider.expire).toHaveBeenCalledWith("ps-661f87c614802d6c402cd82d");
  expect(f.provider.create).not.toHaveBeenCalled();
});
it("does not call expire on a paid snapshot; the DB decides late-payment refunds", async () => {
  const f = fixture(true);
  vi.mocked(f.provider.retrieve).mockResolvedValue({
    ...snapshot,
    payments: [
      {
        id: "pay_fixture",
        amount: 20000,
        currency: "PHP",
        method: "gcash",
        paid_at: new Date().toISOString(),
      },
    ],
  });
  await runPaymentWork(f.admin, f.provider, "http://localhost:3000");
  expect(f.provider.expire).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenCalledWith(
    "sync_checkout",
    expect.objectContaining({
      p_snapshot: expect.objectContaining({
        payments: expect.arrayContaining([
          expect.objectContaining({ id: "pay_fixture" }),
        ]),
      }),
    }),
  );
});
it.each([null, "2026-01-01T00:00:00Z"])(
  "never creates a provider session after booking closure",
  async (started) => {
    const f = fixture(true, { session_id: null, creation_started_at: started });
    await runPaymentWork(f.admin, f.provider, "http://localhost:3000");
    expect(f.provider.create).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenLastCalledWith("fail_payment_work", {
      p_attempt: id,
      p_lease: id,
      p_code: started ? "creation_unknown" : "no_session",
    });
  },
);
it("marks creation before the network call so a crash leaves a reconcilable obligation", async () => {
  const f = fixture(false, { session_id: null });
  await runPaymentWork(f.admin, f.provider, "http://localhost:3000");
  expect(f.rpc).toHaveBeenCalledWith("start_checkout_creation", {
    p_attempt: id,
    p_lease: id,
  });
  expect(f.provider.create).toHaveBeenCalledWith(
    f.job,
    "http://localhost:3000",
  );
});
it("does not repeat an uncertain Xendit create even while the booking remains payable", async () => {
  const f = fixture(false, {
    session_id: null,
    creation_started_at: "2026-10-25T10:00:00Z",
  });
  await runPaymentWork(f.admin, f.provider, "https://rentify.example");
  expect(f.provider.create).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenLastCalledWith("fail_payment_work", {
    p_attempt: id,
    p_lease: id,
    p_code: "creation_unknown",
  });
});
it("rejects a session with another reference instead of binding it", async () => {
  const f = fixture();
  vi.mocked(f.provider.retrieve).mockResolvedValue({
    ...snapshot,
    reference: "b1000000-0000-4000-8000-000000000001",
  });
  await runPaymentWork(f.admin, f.provider, "http://localhost:3000");
  expect(f.rpc).not.toHaveBeenCalledWith("sync_checkout", expect.anything());
  expect(f.rpc).toHaveBeenLastCalledWith(
    "fail_payment_work",
    expect.objectContaining({ p_code: "provider_invalid" }),
  );
});
