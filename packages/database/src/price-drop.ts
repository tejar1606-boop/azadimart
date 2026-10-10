import { eq } from "drizzle-orm";
import type { createDatabase } from "./client";
import { products } from "./schema/catalog";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Keeps a product's "Price drop" marker in step with its lowest active price.
 * Lowering the price starts (or extends) the marker and keeps the highest
 * "before" price within the current drop, so repeated cuts show the full
 * saving. Raising it back to or above that price clears the marker.
 */
export async function recordLowestPriceChange(tx: Db | Tx, productId: string, beforePaise: number | null, afterPaise: number | null): Promise<void> {
  if (beforePaise === null || afterPaise === null || beforePaise === afterPaise) return;
  const current = (await tx.select({ droppedAt: products.priceDroppedAt, before: products.priceBeforeDropPaise }).from(products).where(eq(products.id, productId)).limit(1))[0];
  const recentDrop = current?.droppedAt && current.before && Date.now() - current.droppedAt.getTime() < 30 * 24 * 60 * 60 * 1000 ? current.before : null;
  const reference = Math.max(beforePaise, recentDrop ?? 0);
  if (afterPaise < reference) {
    await tx.update(products).set({ priceDroppedAt: new Date(), priceBeforeDropPaise: reference }).where(eq(products.id, productId));
  } else {
    await tx.update(products).set({ priceDroppedAt: null, priceBeforeDropPaise: null }).where(eq(products.id, productId));
  }
}
