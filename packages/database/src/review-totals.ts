import { and, count, eq, sum } from "drizzle-orm";
import type { createDatabase } from "./client";
import { products } from "./schema/catalog";
import { productReviews } from "./schema/reviews";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Recomputes a product's published review count and rating total. Call it in
 * the same transaction as any review insert, edit, hide or unhide so product
 * cards and pages never show stale stars.
 */
export async function refreshProductRating(tx: Db | Tx, productId: string): Promise<{ reviewCount: number; ratingTotal: number }> {
  const row = (await tx.select({ n: count(), total: sum(productReviews.rating) }).from(productReviews)
    .where(and(eq(productReviews.productId, productId), eq(productReviews.status, "PUBLISHED"))))[0];
  const reviewCount = Number(row?.n ?? 0);
  const ratingTotal = Number(row?.total ?? 0);
  await tx.update(products).set({ reviewCount, ratingTotal }).where(eq(products.id, productId));
  return { reviewCount, ratingTotal };
}
