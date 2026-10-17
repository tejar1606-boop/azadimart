/**
 * How a coupon splits across the lines of a cart. Used by the cart preview,
 * checkout and product pages so they always agree.
 *
 * Coupons paid by sellers (SELLERS) only touch products whose seller allows
 * at least that much off (percentage coupons) or any coupon at all (fixed
 * amounts, capped per line at the allowed percentage). That discount is the
 * seller's share and comes out of their payout. A single seller's own
 * coupon (SELLER) is also paid by that seller. LOIMART coupons cost
 * sellers nothing.
 */
export type CouponScope = { productIds?: string[]; categoryIds?: string[]; sellerIds?: string[] };
export type CouponForAllocation = {
  discountType: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  discountValue: number;
  maximumDiscountPaise: number | null;
  minimumOrderPaise: number;
  fundingType: "AZADIMART" | "SELLER" | "SELLERS";
  sellerId: string | null;
  scope: CouponScope | null;
};
export type CouponLine = { key: string; productId: string; categoryId: string; sellerId: string; lineTotalPaise: number; couponMaxDiscountPct: number };
export type CouponAllocation = {
  eligible: CouponLine[];
  eligibleSubtotalPaise: number;
  discountPaise: number;
  /** Discount per line key (only lines that got some). */
  perLine: Map<string, number>;
  /** True when sellers pay (their payout is reduced by perLine). */
  sellerFunded: boolean;
  problem: null | "NOT_APPLICABLE" | "MINIMUM";
};

export function matchesCouponScope(scope: CouponScope | null | undefined, line: { productId: string; categoryId: string; sellerId: string }) {
  const s = scope ?? {};
  if (!s.productIds?.length && !s.categoryIds?.length && !s.sellerIds?.length) return true;
  return Boolean(s.productIds?.includes(line.productId) || s.categoryIds?.includes(line.categoryId) || s.sellerIds?.includes(line.sellerId));
}

/** Whether a product's seller allows this coupon (always true unless the coupon is paid by sellers). */
export function productAllowsCoupon(coupon: Pick<CouponForAllocation, "fundingType" | "discountType" | "discountValue">, couponMaxDiscountPct: number) {
  if (coupon.fundingType !== "SELLERS") return true;
  if (couponMaxDiscountPct <= 0) return false;
  return coupon.discountType === "PERCENTAGE" ? couponMaxDiscountPct >= coupon.discountValue : coupon.discountType === "FIXED";
}

/** Splits `total` across lines in proportion to `weights` (largest remainder, exact). */
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; out[i]! += 1; left--; }
  return out;
}

/** Splits `total` in proportion to `weights`, never above each cap; what a capped line can't take goes to the others. */
function fillUpTo(total: number, weights: number[], caps: number[]): number[] {
  const out = weights.map(() => 0);
  let left = total;
  let open = weights.map((_, i) => i).filter((i) => caps[i]! > 0);
  while (left > 0 && open.length) {
    const share = split(left, open.map((i) => weights[i]!));
    let given = 0;
    open.forEach((i, k) => { const add = Math.min(share[k]!, caps[i]! - out[i]!); out[i]! += add; given += add; });
    left -= given;
    open = open.filter((i) => out[i]! < caps[i]!);
    if (given === 0) break;
  }
  return out;
}

export function allocateCoupon(coupon: CouponForAllocation, lines: CouponLine[]): CouponAllocation {
  const sellerFunded = coupon.fundingType === "SELLERS" || coupon.fundingType === "SELLER";
  const eligible = lines.filter((l) => matchesCouponScope(coupon.scope, l) && (!coupon.sellerId || l.sellerId === coupon.sellerId) && productAllowsCoupon(coupon, l.couponMaxDiscountPct));
  const eligibleSubtotalPaise = eligible.reduce((s, l) => s + l.lineTotalPaise, 0);
  const empty = (problem: CouponAllocation["problem"]): CouponAllocation => ({ eligible, eligibleSubtotalPaise, discountPaise: 0, perLine: new Map(), sellerFunded, problem });
  if (!eligible.length) return empty("NOT_APPLICABLE");
  if (eligibleSubtotalPaise < coupon.minimumOrderPaise) return empty("MINIMUM");
  if (coupon.discountType === "FREE_SHIPPING") return empty(null);

  // What each line may give: everything, or (paid by sellers) up to the seller's allowed percentage.
  const caps = eligible.map((l) => (coupon.fundingType === "SELLERS" ? Math.floor((l.lineTotalPaise * l.couponMaxDiscountPct) / 100) : l.lineTotalPaise));
  let amounts: number[];
  if (coupon.discountType === "PERCENTAGE") {
    amounts = eligible.map((l, i) => Math.min(caps[i]!, Math.floor((l.lineTotalPaise * coupon.discountValue) / 100)));
  } else {
    const want = Math.min(coupon.discountValue, caps.reduce((a, b) => a + b, 0));
    amounts = fillUpTo(want, eligible.map((l) => l.lineTotalPaise), caps);
  }
  let total = amounts.reduce((a, b) => a + b, 0);
  if (coupon.maximumDiscountPaise !== null && total > coupon.maximumDiscountPaise) {
    amounts = split(coupon.maximumDiscountPaise, amounts).map((a, i) => Math.min(a, amounts[i]!));
    total = coupon.maximumDiscountPaise;
  }
  const perLine = new Map<string, number>();
  eligible.forEach((l, i) => { if (amounts[i]! > 0) perLine.set(l.key, amounts[i]!); });
  return { eligible, eligibleSubtotalPaise, discountPaise: total, perLine, sellerFunded, problem: null };
}
