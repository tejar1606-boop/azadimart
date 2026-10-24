import { describe, expect, it } from "vitest";
import { calculateSettlement, commissionFreeUntil, feeInvoiceNumber, nextSettlementDate, payoutEligibleAt, previousCycleStart, settlementCycleStart } from "./settlement";
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
    expect(s).toEqual({ grossPaise: 100_000, sellerDiscountPaise: 0, commissionFree: false, commissionRateBps: 500, commissionPaise: 5_000, gstOnCommissionPaise: 900, tcsPaise: 500, tdsPaise: 100, shippingFeePaise: 0, netPaise: 93_500 });
  });
  it("a coupon the seller pays comes off first; commission and taxes are on the price after it", () => {
    const s = calculateSettlement({ grossPaise: 100_000, sellerDiscountPaise: 10_000, orderedAt: new Date("2026-04-16T00:00:00Z"), sellerApprovedAt: approved, gstRegistered: true });
    // ₹1,000 item, ₹100 coupon paid by the seller → sold for ₹900: commission ₹45, GST ₹8.10, TCS ₹4.50, TDS ₹0.90 → ₹841.50
    expect(s).toMatchObject({ grossPaise: 100_000, sellerDiscountPaise: 10_000, commissionPaise: 4_500, gstOnCommissionPaise: 810, tcsPaise: 450, tdsPaise: 90, netPaise: 84_150 });
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
  it("takes the LOIMART shipping fee off the payout", () => {
    const s = calculateSettlement({ grossPaise: 100_000, orderedAt: new Date("2026-01-01"), sellerApprovedAt: new Date("2026-01-01"), gstRegistered: false, shippingFeePaise: 6_000 });
    expect(s).toMatchObject({ commissionPaise: 0, shippingFeePaise: 6_000, netPaise: 100_000 - 100 - 6_000 });
  });
});

describe("referral bonus months", () => {
  const long = { grossPaise: 100000, sellerApprovedAt: new Date("2025-01-01"), orderedAt: new Date("2026-06-01"), gstRegistered: true };
  it("charges commission after the first free months", () => {
    expect(calculateSettlement(long).commissionFree).toBe(false);
  });
  it("orders inside a referral bonus period pay no commission", () => {
    const s = calculateSettlement({ ...long, inBonusFreePeriod: true });
    expect(s.commissionFree).toBe(true);
    expect(s.commissionPaise).toBe(0);
    expect(s.gstOnCommissionPaise).toBe(0);
  });
});

describe("15-day settlement cycles (India time)", () => {
  it("cycles start on the 1st and the 16th", () => {
    expect(settlementCycleStart(new Date("2026-10-22T06:00:00Z")).toISOString()).toBe("2026-10-15T18:30:00.000Z"); // 16 Oct 00:00 IST
    expect(settlementCycleStart(new Date("2026-10-15T18:29:00Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z"); // 15 Oct 23:59 IST → 1 Oct
    expect(settlementCycleStart(new Date("2026-10-22T06:00:00Z"), "DAILY").toISOString()).toBe("2026-10-21T18:30:00.000Z");
  });
  it("finds the previous and next settlement day", () => {
    const oct16 = new Date("2026-10-15T18:30:00Z");
    expect(previousCycleStart(oct16).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(previousCycleStart(new Date("2026-09-30T18:30:00Z")).toISOString()).toBe("2026-09-15T18:30:00.000Z");
    expect(nextSettlementDate(new Date("2026-10-22T06:00:00Z")).toISOString()).toBe("2026-10-31T18:30:00.000Z"); // 1 Nov
    expect(nextSettlementDate(new Date("2026-12-20T06:00:00Z")).toISOString()).toBe("2026-12-31T18:30:00.000Z"); // 1 Jan
  });
  it("numbers LOIMART's fee invoices", () => {
    expect(feeInvoiceNumber("2026-27", 12)).toBe("LMS/2627/000012");
  });
});
