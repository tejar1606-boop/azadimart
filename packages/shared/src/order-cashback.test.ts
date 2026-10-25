import { describe, expect, it } from "vitest";
import { cashbackFor, cashbackRuleText, splitCashback } from "./order-cashback";

describe("order cashback", () => {
  const s = { enabled: true, percentBps: 200, maxPaise: 50_00 };
  it("is a percentage of the items in whole rupees, up to the maximum", () => {
    expect(cashbackFor(s, 349_00)).toBe(6_00);
    expect(cashbackFor(s, 40_00)).toBe(0);
    expect(cashbackFor(s, 10_000_00)).toBe(50_00);
    expect(cashbackFor({ ...s, maxPaise: 0 }, 10_000_00)).toBe(200_00);
  });
  it("is nothing when switched off or the order is free", () => {
    expect(cashbackFor({ ...s, enabled: false }, 1_000_00)).toBe(0);
    expect(cashbackFor(s, 0)).toBe(0);
  });
  it("splits exactly across lines by value", () => {
    const parts = splitCashback(1_001, [1_000, 2_000, 0]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_001);
    expect(parts[2]).toBe(0);
    expect(parts[1]).toBeGreaterThan(parts[0]!);
  });
  it("reads nicely", () => {
    expect(cashbackRuleText(s)).toBe("2% cashback, up to ₹50");
  });
});
