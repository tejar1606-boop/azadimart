import { orderItems, orders, shipments, type Database } from "@azadimart/database";
import { and, eq, inArray } from "drizzle-orm";

type Executor = Pick<Database, "select" | "update">;

const HANDED_OVER = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

/**
 * Derive the order status from every seller's shipment. An order advances only
 * when all sellers on it have reached a stage, regardless of the order in
 * which sellers create or progress their shipments.
 *
 * Inventory is NOT touched here: the reservation made at checkout is
 * finalized on delivery (shipment route) or released by order cancellation.
 */
export async function syncOrderFulfillmentStatus(db: Executor, orderId: string): Promise<void> {
  const sellerIds = new Set(
    (await db.select({ sellerId: orderItems.sellerId }).from(orderItems).where(eq(orderItems.orderId, orderId)))
      .map((row) => row.sellerId),
  );
  if (sellerIds.size === 0) return;

  const rows = await db.select({ sellerId: shipments.sellerId, status: shipments.status })
    .from(shipments).where(eq(shipments.orderId, orderId));
  const allSellersIn = (states: readonly string[]) => {
    const reached = new Set(rows.filter((row) => states.includes(row.status)).map((row) => row.sellerId));
    return [...sellerIds].every((sellerId) => reached.has(sellerId));
  };

  const now = new Date();
  if (allSellersIn(["DELIVERED"])) {
    await db.update(orders).set({ status: "DELIVERED", deliveredAt: now, updatedAt: now })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"])));
  } else if (allSellersIn(["OUT_FOR_DELIVERY", "DELIVERED"])) {
    await db.update(orders).set({ status: "OUT_FOR_DELIVERY", updatedAt: now })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["CONFIRMED", "PACKED", "SHIPPED"])));
  } else if (allSellersIn(HANDED_OVER)) {
    await db.update(orders).set({ status: "SHIPPED", updatedAt: now })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["CONFIRMED", "PACKED"])));
  }
}
