import { createDatabase, inventory, orderItems, orders, productReviews, productVariants, products, sellerAadhaar, sellerBankAccounts, sellers, shipments } from "@azadimart/database";
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
  const [open, needsWork, inReview, lowStock, newReviews, aadhaar, bank] = await Promise.all([
    db.selectDistinct({ id: orders.id }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.sellerId, sellerId), inArray(orders.status, ["CONFIRMED", "PACKED"]))),
    db.select({ n: count() }).from(products).where(and(eq(products.sellerId, sellerId), eq(products.status, "QC_REJECTED"))),
    db.select({ n: count() }).from(products).where(and(eq(products.sellerId, sellerId), inArray(products.status, ["PENDING_QC", "PENDING_ADMIN_APPROVAL"]))),
    db.select({ n: count() }).from(inventory).innerJoin(productVariants, eq(productVariants.id, inventory.variantId)).innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(inventory.sellerId, sellerId), notInArray(products.status, ["ARCHIVED"]), eq(productVariants.isActive, true), lte(sql`${inventory.onHand} - ${inventory.reserved}`, LOW_STOCK_UNITS))),
    db.select({ n: count() }).from(productReviews).innerJoin(products, eq(products.id, productReviews.productId))
      .where(and(eq(products.sellerId, sellerId), eq(productReviews.status, "PUBLISHED"), isNull(productReviews.sellerReply), gt(productReviews.createdAt, weekAgo))),
    db.select({ status: sellerAadhaar.status }).from(sellerAadhaar).where(eq(sellerAadhaar.sellerId, sellerId)).limit(1),
    db.select({ status: sellerBankAccounts.verificationStatus }).from(sellerBankAccounts).where(and(eq(sellerBankAccounts.sellerId, sellerId), eq(sellerBankAccounts.isPrimary, true))).limit(1),
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
    aadhaarVerified: aadhaar[0]?.status === "VERIFIED",
    bankStatus: bank[0]?.status ?? "NONE",
  };
}


/**
 * Seller performance over the last 90 days (Amazon/Flipkart-style metrics):
 * cancellation rate = orders cancelled by the seller or auto-cancelled for not
 * shipping, out of all orders with their items; late dispatch rate = shipments
 * created after the order's ship-by time, out of shipped orders.
 */
export async function loadSellerPerformance(db: Db, sellerId: string) {
  const result = await db.execute<{ total: number; cancelled: number; shipped: number; late: number }>(sql`
    with mine as (
      select distinct o.id, o.cancelled_by, o.ship_by_at from orders o join order_items oi on oi.order_id = o.id
      where oi.seller_id = ${sellerId} and o.created_at > now() - interval '90 days'
    ), first_ship as (
      select s.order_id, min(s.created_at) shipped_at from shipments s
      where s.seller_id = ${sellerId} and s.status not in ('FAILED', 'CANCELLED') group by s.order_id
    )
    select
      (select count(*)::int from mine) total,
      (select count(*)::int from mine where cancelled_by in ('SELLER', 'SYSTEM')) cancelled,
      (select count(*)::int from mine m join first_ship f on f.order_id = m.id) shipped,
      (select count(*)::int from mine m join first_ship f on f.order_id = m.id where m.ship_by_at is not null and f.shipped_at > m.ship_by_at) late`);
  const r = result.rows[0] ?? { total: 0, cancelled: 0, shipped: 0, late: 0 };
  return {
    orders: r.total, cancelled: r.cancelled, shipped: r.shipped, late: r.late,
    cancellationRate: r.total ? r.cancelled / r.total : 0,
    lateDispatchRate: r.shipped ? r.late / r.shipped : 0,
  };
}
