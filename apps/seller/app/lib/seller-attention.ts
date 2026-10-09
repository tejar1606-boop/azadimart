import { createDatabase, inventory, orderItems, orders, productReviews, productVariants, products, sellers, shipments } from "@azadimart/database";
import { and, count, eq, gt, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";

import type { SellerAttention } from "./notices";

type Db = ReturnType<typeof createDatabase>;

/** Stock at or below this many units counts as "low". */
export const LOW_STOCK_UNITS = 5;



/**
 * Everything that needs a seller's attention, shared by the sidebar (badges,
 * Notices count) and the Notices page so they always agree.
 */
export async function loadSellerAttention(db: Db, sellerId: string): Promise<SellerAttention | null> {
  const seller = (await db.select({ storeName: sellers.storeName, status: sellers.status }).from(sellers).where(eq(sellers.id, sellerId)).limit(1))[0];
  if (!seller) return null;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [open, needsWork, inReview, lowStock, newReviews] = await Promise.all([
    db.selectDistinct({ id: orders.id }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.sellerId, sellerId), inArray(orders.status, ["CONFIRMED", "PACKED"]))),
    db.select({ n: count() }).from(products).where(and(eq(products.sellerId, sellerId), eq(products.status, "QC_REJECTED"))),
    db.select({ n: count() }).from(products).where(and(eq(products.sellerId, sellerId), inArray(products.status, ["PENDING_QC", "PENDING_ADMIN_APPROVAL"]))),
    db.select({ n: count() }).from(inventory).innerJoin(productVariants, eq(productVariants.id, inventory.variantId)).innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(inventory.sellerId, sellerId), notInArray(products.status, ["ARCHIVED"]), eq(productVariants.isActive, true), lte(sql`${inventory.onHand} - ${inventory.reserved}`, LOW_STOCK_UNITS))),
    db.select({ n: count() }).from(productReviews).innerJoin(products, eq(products.id, productReviews.productId))
      .where(and(eq(products.sellerId, sellerId), eq(productReviews.status, "PUBLISHED"), isNull(productReviews.sellerReply), gt(productReviews.createdAt, weekAgo))),
  ]);
  const shipped = open.length ? await db.select({ orderId: shipments.orderId }).from(shipments)
    .where(and(eq(shipments.sellerId, sellerId), inArray(shipments.orderId, open.map((o) => o.id)), notInArray(shipments.status, ["FAILED", "CANCELLED"]))) : [];
  return {
    storeName: seller.storeName,
    status: seller.status,
    toShip: open.length - new Set(shipped.map((s) => s.orderId)).size,
    needsWork: Number(needsWork[0]?.n ?? 0),
    inReview: Number(inReview[0]?.n ?? 0),
    lowStock: Number(lowStock[0]?.n ?? 0),
    newReviews: Number(newReviews[0]?.n ?? 0),
  };
}

