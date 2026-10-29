import { comparePrices, type PricedVariant } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import type { createDatabase } from "./client";
import { productPriceHistory, productVariants, products } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
export type PriceHistorySource = "SELLER_EDIT" | "SELLER_EDIT_APPROVED" | "SELLER_COUPON_LIMIT" | "ADMIN_EDIT";
export type PriceHistoryActors = { source: PriceHistorySource; requestedByUserId?: string | null; approvedByUserId?: string | null };

/** The product's active sizes/colours with their prices (before an edit). */
export async function priceSnapshot(tx: Tx, productId: string): Promise<PricedVariant[]> {
  return tx.select({ id: productVariants.id, sku: productVariants.sku, title: productVariants.title, pricePaise: productVariants.pricePaise, compareAtPaise: productVariants.compareAtPaise })
    .from(productVariants).where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)));
}

/** Records every size whose price or MRP changed since `before` (new sizes too). */
export async function recordPriceHistory(tx: Tx, productId: string, before: PricedVariant[], actors: PriceHistoryActors): Promise<number> {
  const after = await priceSnapshot(tx, productId);
  const rows = comparePrices(before, after).rows.filter((r) => r.changed);
  if (!rows.length) return 0;
  await tx.insert(productPriceHistory).values(rows.map((r) => ({
    productId, variantId: r.key.startsWith("new-") ? null : r.key, sku: r.sku, variantTitle: r.title,
    pricePaiseBefore: r.before?.pricePaise ?? null, pricePaiseAfter: r.after.pricePaise,
    mrpPaiseBefore: r.before?.compareAtPaise ?? null, mrpPaiseAfter: r.after.compareAtPaise,
    source: actors.source, requestedByUserId: actors.requestedByUserId ?? null, approvedByUserId: actors.approvedByUserId ?? null, mrpRaised: r.mrpRaised,
  })));
  return rows.length;
}

/** The product's current coupon limit (how much seller-paid coupons may take off). */
export async function couponLimitOf(tx: Tx, productId: string): Promise<number> {
  return (await tx.select({ pct: products.couponMaxDiscountPct }).from(products).where(eq(products.id, productId)).limit(1))[0]?.pct ?? 0;
}

/** Records a change of the coupon limit (whole product), against its lowest-priced size. */
export async function recordCouponLimitChange(tx: Tx, productId: string, beforePct: number, afterPct: number, actors: PriceHistoryActors): Promise<boolean> {
  if (beforePct === afterPct) return false;
  const sizes = await priceSnapshot(tx, productId);
  const cheapest = sizes.sort((a, b) => a.pricePaise - b.pricePaise)[0];
  if (!cheapest) return false;
  await tx.insert(productPriceHistory).values({
    productId, variantId: cheapest.id ?? null, sku: cheapest.sku, variantTitle: "All sizes", kind: "COUPON_LIMIT",
    pricePaiseBefore: cheapest.pricePaise, pricePaiseAfter: cheapest.pricePaise, mrpPaiseBefore: cheapest.compareAtPaise, mrpPaiseAfter: cheapest.compareAtPaise,
    couponPctBefore: beforePct, couponPctAfter: afterPct,
    source: actors.source, requestedByUserId: actors.requestedByUserId ?? null, approvedByUserId: actors.approvedByUserId ?? null,
  });
  return true;
}
