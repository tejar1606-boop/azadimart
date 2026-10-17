import { describe, expect, it } from "vitest";
import { allocateCoupon, productAllowsCoupon, type CouponForAllocation, type CouponLine } from "./coupon-allocation";

const line = (key: string, total: number, max: number, sellerId = "s1"): CouponLine => ({ key, productId: "p" + key, categoryId: "c", sellerId, lineTotalPaise: total, couponMaxDiscountPct: max });
const coupon = (c: Partial<CouponForAllocation>): CouponForAllocation => ({ discountType: "PERCENTAGE", discountValue: 10, maximumDiscountPaise: null, minimumOrderPaise: 0, fundingType: "SELLERS", sellerId: null, scope: {}, ...c });

describe("coupons paid by sellers", () => {
  it("only applies to products whose seller allows at least that much off", () => {
    const a = allocateCoupon(coupon({ discountValue: 10 }), [line("a", 100_000, 15), line("b", 50_000, 5), line("c", 20_000, 0)]);
    expect(a.eligible.map((l) => l.key)).toEqual(["a"]);
    expect(a.discountPaise).toBe(10_000);
    expect(a.perLine.get("a")).toBe(10_000);
    expect(a.sellerFunded).toBe(true);
  });
  it("is not applicable when no product allows it", () => {
    expect(allocateCoupon(coupon({ discountValue: 20 }), [line("a", 100_000, 15)]).problem).toBe("NOT_APPLICABLE");
  });
  it("fixed amounts are capped per product at the seller's allowed percentage", () => {
    const a = allocateCoupon(coupon({ discountType: "FIXED", discountValue: 50_000 }), [line("a", 100_000, 10), line("b", 100_000, 20)]);
    expect(a.perLine.get("a")).toBe(10_000);
    expect(a.perLine.get("b")).toBe(20_000);
    expect(a.discountPaise).toBe(30_000);
  });
  it("an overall cap is shared across the products", () => {
    const a = allocateCoupon(coupon({ discountValue: 10, maximumDiscountPaise: 6_000 }), [line("a", 100_000, 10), line("b", 50_000, 10)]);
    expect(a.discountPaise).toBe(6_000);
    expect((a.perLine.get("a") ?? 0) + (a.perLine.get("b") ?? 0)).toBe(6_000);
    expect(a.perLine.get("a")).toBe(4_000);
  });
  it("LOIMART coupons ignore the seller limit and cost sellers nothing", () => {
    const a = allocateCoupon(coupon({ fundingType: "AZADIMART", discountValue: 20 }), [line("a", 100_000, 0)]);
    expect(a.discountPaise).toBe(20_000);
    expect(a.sellerFunded).toBe(false);
  });
  it("minimum order counts only the products the coupon applies to", () => {
    expect(allocateCoupon(coupon({ minimumOrderPaise: 120_000 }), [line("a", 100_000, 10), line("b", 50_000, 0)]).problem).toBe("MINIMUM");
  });
  it("shows on a product only if the seller allows it", () => {
    expect(productAllowsCoupon({ fundingType: "SELLERS", discountType: "PERCENTAGE", discountValue: 15 }, 10)).toBe(false);
    expect(productAllowsCoupon({ fundingType: "SELLERS", discountType: "PERCENTAGE", discountValue: 10 }, 15)).toBe(true);
    expect(productAllowsCoupon({ fundingType: "AZADIMART", discountType: "PERCENTAGE", discountValue: 50 }, 0)).toBe(true);
  });
});
