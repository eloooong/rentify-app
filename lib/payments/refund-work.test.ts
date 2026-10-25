import { expect, it, vi } from "vitest";
import { ProviderError } from "./provider";
import type { RefundProvider, RefundSnapshot } from "./refund-provider";
import type { PaymentClient } from "./work";
import { runRefundWork } from "./refund-work";
const id = "a1000000-0000-4000-8000-000000000001";
const snapshot: RefundSnapshot = {
  id: "ref_fixture",
  payment_id: "pay_fixture",
  amount: 425000,
  currency: "PHP",
  livemode: false,
  status: "pending",
  reference: id,
};
function fixture(
  overrides: Record<string, unknown> = {},
  list: RefundSnapshot[] = [],
) {
  const job = {
    id,
    receipt_id: id,
    lease_token: id,
    amount: 425000,
    payment_id: "pay_fixture",
    provider_refund_id: null,
    creation_started_at: null,
    ...overrides,
  };
  const rpc = vi.fn(async (name: string) => ({
    data: name === "claim_refund_work" ? [job] : null,
    error: null as unknown,
  }));
  const eq = vi.fn().mockResolvedValue({ data: [], error: null });
  const admin = {
    rpc,
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })),
  } as unknown as PaymentClient;
  const provider: RefundProvider = {
    create: vi.fn().mockResolvedValue(snapshot),
    retrieve: vi.fn().mockResolvedValue(snapshot),
    list: vi.fn().mockResolvedValue(list),
  };
  return { job, rpc, admin, provider, eq };
}
it("records a durable start before its one refund POST", async () => {
  const f = fixture();
  vi.mocked(f.provider.create).mockImplementation(async () => {
    expect(f.rpc).toHaveBeenCalledWith("start_refund_creation", {
      p_refund: id,
      p_lease: id,
    });
    return snapshot;
  });
  expect(await runRefundWork(f.admin, f.provider)).toEqual({
    claimed: 1,
    completed: 1,
  });
  expect(f.provider.create).toHaveBeenCalledTimes(1);
  expect(f.rpc).toHaveBeenLastCalledWith("sync_refund", {
    p_refund: id,
    p_lease: id,
    p_snapshot: snapshot,
  });
});
it("does not contact the provider after a failed persistence fence", async () => {
  const f = fixture();
  f.rpc.mockImplementation(async (name) => ({
    data: name === "claim_refund_work" ? [f.job] : null,
    error: name === "start_refund_creation" ? new Error() : null,
  }));
  await runRefundWork(f.admin, f.provider);
  expect(f.provider.create).not.toHaveBeenCalled();
});
it("quarantines a queued refund that crosses the provider window before submission", async () => {
  const f = fixture();
  f.rpc.mockImplementation(async (name) => ({
    data: name === "claim_refund_work" ? [f.job] : null,
    error:
      name === "start_refund_creation" ? { message: "refund_review" } : null,
  }));
  await runRefundWork(f.admin, f.provider);
  expect(f.provider.create).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenLastCalledWith("fail_refund_work", {
    p_refund: id,
    p_lease: id,
    p_code: "refund_review",
  });
});
it("quarantines database-rejected provider status regressions", async () => {
  const f = fixture({
    provider_refund_id: "ref_fixture",
    creation_started_at: "2026-01-01",
  });
  f.rpc.mockImplementation(async (name) => ({
    data: name === "claim_refund_work" ? [f.job] : null,
    error: name === "sync_refund" ? { message: "provider_invalid" } : null,
  }));
  await runRefundWork(f.admin, f.provider);
  expect(f.rpc).toHaveBeenLastCalledWith("fail_refund_work", {
    p_refund: id,
    p_lease: id,
    p_code: "provider_invalid",
  });
});
it("retrieves a known provider refund without another create or list", async () => {
  const f = fixture({
    provider_refund_id: "ref_fixture",
    creation_started_at: "2026-01-01",
  });
  await runRefundWork(f.admin, f.provider);
  expect(f.provider.retrieve).toHaveBeenCalledWith(
    "ref_fixture",
    "pay_fixture",
  );
  expect(f.provider.create).not.toHaveBeenCalled();
  expect(f.provider.list).not.toHaveBeenCalled();
});
it("recovers a lost POST response by its unique marker without another create", async () => {
  const f = fixture({ creation_started_at: "2026-01-01" }, [snapshot]);
  expect((await runRefundWork(f.admin, f.provider)).completed).toBe(1);
  expect(f.provider.create).not.toHaveBeenCalled();
});
it("retains an unknown outcome and continues read-only discovery when no match is visible", async () => {
  const f = fixture({ creation_started_at: "2026-01-01" });
  await runRefundWork(f.admin, f.provider);
  expect(f.provider.create).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenLastCalledWith("fail_refund_work", {
    p_refund: id,
    p_lease: id,
    p_code: "refund_unknown",
  });
});
it("does not treat a timeout as a confirmed failure that releases the amount", async () => {
  const f = fixture();
  vi.mocked(f.provider.create).mockRejectedValue(
    new ProviderError("provider_unavailable"),
  );
  await runRefundWork(f.admin, f.provider);
  expect(f.rpc).toHaveBeenLastCalledWith("fail_refund_work", {
    p_refund: id,
    p_lease: id,
    p_code: "provider_unavailable",
  });
  expect(f.rpc).not.toHaveBeenCalledWith("sync_refund", expect.anything());
});
it("quarantines external refunds and duplicate markers", async () => {
  for (const list of [
    [{ ...snapshot, reference: null }],
    [snapshot, { ...snapshot, id: "ref_duplicate" }],
  ]) {
    const f = fixture({}, list);
    await runRefundWork(f.admin, f.provider);
    expect(f.provider.create).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenLastCalledWith(
      "fail_refund_work",
      expect.objectContaining({
        p_code: list.length === 1 ? "refund_review" : "provider_invalid",
      }),
    );
  }
});
it.each([
  { amount: 1 },
  { payment_id: "pay_other" },
  { reference: null },
  { id: "ref_other" },
])("does not bind mismatched evidence %j", async (override) => {
  const f = fixture({
    provider_refund_id: "ref_fixture",
    creation_started_at: "2026-01-01",
  });
  vi.mocked(f.provider.retrieve).mockResolvedValue({
    ...snapshot,
    ...override,
  });
  await runRefundWork(f.admin, f.provider);
  expect(f.rpc).not.toHaveBeenCalledWith("sync_refund", expect.anything());
});
