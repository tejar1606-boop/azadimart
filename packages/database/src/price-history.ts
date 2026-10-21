import { comparePrices, type PricedVariant } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import type { createDatabase } from "./client";
import { productPriceHistory, productVariants } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
export type PriceHistorySource = "SELLER_EDIT" | "SELLER_EDIT_APPROVED" | "ADMIN_EDIT";
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
