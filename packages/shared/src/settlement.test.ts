import { describe, expect, it } from "vitest";
import { calculateSettlement, commissionFreeUntil, payoutEligibleAt } from "./settlement";
import { sellerBankAccountSchema } from "./validation";

const approved = new Date("2026-01-15T10:00:00Z");

describe("seller settlement", () => {
  it("first 3 months after approval are commission-free", () => {
    expect(commissionFreeUntil(approved).toISOString()).toBe("2026-04-15T10:00:00.000Z");
    const s = calculateSettlement({ grossPaise: 100_000, orderedAt: new Date("2026-04-14T00:00:00Z"), sellerApprovedAt: approved, gstRegistered: true });
    expect(s).toMatchObject({ commissionFree: true, commissionRateBps: 0, commissionPaise: 0, gstOnCommissionPaise: 0 });
  });
  it("after 3 months: 5% commission + 18% GST on it, TCS 0.5%, TDS 0.1%", () => {
    const s = calculateSettlement({ grossPaise: 100_000, orderedAt: new Date("2026-04-16T00:00:00Z"), sellerApprovedAt: approved, gstRegistered: true });
    // ₹1,000 order: commission ₹50, GST ₹9, TCS ₹5, TDS ₹1 → seller gets ₹935
    expect(s).toEqual({ grossPaise: 100_000, commissionFree: false, commissionRateBps: 500, commissionPaise: 5_000, gstOnCommissionPaise: 900, tcsPaise: 500, tdsPaise: 100, netPaise: 93_500 });
  });
  it("goes by the order date, not the payout date", () => {
    const s = calculateSettlement({ grossPaise: 100_000, orderedAt: new Date("2026-04-15T09:59:59Z"), sellerApprovedAt: approved, gstRegistered: false });
    expect(s.commissionFree).toBe(true);
  });
  it("no TCS for sellers without GSTIN (Enrolment ID)", () => {
    const s = calculateSettlement({ grossPaise: 100_000, orderedAt: new Date("2026-06-01T00:00:00Z"), sellerApprovedAt: approved, gstRegistered: false });
    expect(s.tcsPaise).toBe(0);
    expect(s.netPaise).toBe(100_000 - 5_000 - 900 - 100);
  });
  it("TCS uses the taxable value when known", () => {
    const s = calculateSettlement({ grossPaise: 118_000, taxableValuePaise: 100_000, orderedAt: new Date("2026-01-20T00:00:00Z"), sellerApprovedAt: approved, gstRegistered: true });
    expect(s.tcsPaise).toBe(500);
  });
  it("payable 7 days after delivery", () => {
    expect(payoutEligibleAt(new Date("2026-10-01T12:00:00Z")).toISOString()).toBe("2026-10-08T12:00:00.000Z");
  });
});

describe("bank account details", () => {
  const ok = { accountHolderName: "Bharat Demo Store", accountNumber: "5010 0123 456789", confirmAccountNumber: "50100123456789", ifsc: "hdfc0001234" };
  it("accepts and normalises valid details", () => {
    expect(sellerBankAccountSchema.parse(ok)).toMatchObject({ accountNumber: "50100123456789", ifsc: "HDFC0001234" });
  });
  it("rejects bad IFSC, short numbers and mismatches", () => {
    expect(sellerBankAccountSchema.safeParse({ ...ok, ifsc: "HDFC1001234" }).success).toBe(false);
    expect(sellerBankAccountSchema.safeParse({ ...ok, accountNumber: "12345678", confirmAccountNumber: "12345678" }).success).toBe(false);
    expect(sellerBankAccountSchema.safeParse({ ...ok, confirmAccountNumber: "50100123456780" }).success).toBe(false);
  });
});
