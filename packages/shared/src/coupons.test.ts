import { describe, expect, it } from "vitest";
import { couponSchema, couponUpdateSchema } from "./validation";

const base = {
  code: "SAVE10",
  title: "Save 10%",
  description: "Ten percent off",
  discountType: "PERCENTAGE" as const,
  discountValue: 10,
  minimumOrderPaise: 99900,
  startsAt: "2026-10-07T00:00:00.000Z",
  isActive: true,
};

describe("coupon validation", () => {
  it("accepts a normal percentage coupon", () => {
    expect(couponSchema.parse(base).code).toBe("SAVE10");
  });

  it("rejects percentage values above 100", () => {
    const result = couponSchema.safeParse({ ...base, discountValue: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = couponSchema.safeParse({
      ...base,
      startsAt: "2026-10-08T00:00:00.000Z",
      endsAt: "2026-10-07T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("requires a seller for seller-funded coupons", () => {
    const result = couponSchema.safeParse({ ...base, fundingType: "SELLER" });
    expect(result.success).toBe(false);
  });

  it("allows partial updates", () => {
    expect(couponUpdateSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});
