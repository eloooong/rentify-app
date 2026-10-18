import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";

describe("formatMoney", () => {
  it("formats whole peso amounts from minor units without decimals", () => {
    expect(formatMoney(12000)).toBe("₱120");
    expect(formatMoney(150000)).toBe("₱1,500");
  });

  it("keeps two decimals for fractional amounts", () => {
    expect(formatMoney(12050)).toBe("₱120.50");
  });

  it("formats zero, for a listing with no deposit", () => {
    expect(formatMoney(0)).toBe("₱0");
  });
});
