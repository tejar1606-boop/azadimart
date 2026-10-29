import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { AppError } from "@azadimart/shared";
import type { Database } from "./client";
import { auditLogs, inventory, inventoryMovements, orderItems, orders, payments, shipmentEvents, shipments } from "./schema/index";
import { refundCourierToWallet } from "./seller-wallet";
import { rewardReferralOnFirstDelivery } from "./seller-referrals";
import { issueCreditNote, issueSellerInvoice } from "./invoices";
import { recordReturnAfterSettlement } from "./fee-invoices";

type Executor = Pick<Database, "select" | "update">;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

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
  // Every parcel delivered, or the rest refused/failed and back with their sellers (RTO): the order is done.
  const finished = allSellersIn(["DELIVERED"]) || (allSellersIn(["DELIVERED", "RETURNED", "FAILED", "CANCELLED"]) && rows.some((row) => row.status === "DELIVERED"));
  if (finished) {
    const delivered = await db.update(orders).set({ status: "DELIVERED", deliveredAt: now, updatedAt: now })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"])))
      .returning({ id: orders.id });
    // The courier collects Cash on Delivery at the door, so the order now counts as paid (and can be paid out to sellers).
    if (delivered.length) {
      await db.update(payments).set({ status: "CAPTURED", updatedAt: now })
        .where(and(eq(payments.orderId, orderId), eq(payments.provider, "COD"), eq(payments.status, "PENDING")));
    }
  } else if (allSellersIn(["OUT_FOR_DELIVERY", "DELIVERED"])) {
    await db.update(orders).set({ status: "OUT_FOR_DELIVERY", updatedAt: now })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["CONFIRMED", "PACKED", "SHIPPED"])));
  } else if (allSellersIn(HANDED_OVER)) {
    await db.update(orders).set({ status: "SHIPPED", updatedAt: now })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["CONFIRMED", "PACKED"])));
  }
}


/** Allowed shipment status changes (PENDING → CREATED/FAILED belongs to booking). */
export const SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  PENDING: [],
  CREATED: ["PICKED_UP", "FAILED", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "FAILED", "RETURNED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  FAILED: [],
  RETURNED: [],
  CANCELLED: [],
};

/**
 * Moves a shipment to its next status (seller for their own courier; LOIMART
 * team or courier updates for LOIMART shipping). On delivery the stock that
 * checkout reserved is finalised; the order status follows all its shipments.
 */
export async function advanceShipmentStatus(tx: Tx, input: { shipmentId: string; status: string; actorUserId: string | null; notes?: string | null; sellerId?: string }) {
  const shipment = (await tx.select({ id: shipments.id, orderId: shipments.orderId, sellerId: shipments.sellerId, status: shipments.status })
    .from(shipments).where(input.sellerId ? and(eq(shipments.id, input.shipmentId), eq(shipments.sellerId, input.sellerId)) : eq(shipments.id, input.shipmentId)).limit(1))[0];
  if (!shipment) throw new AppError("NOT_FOUND", "Shipment not found");
  if (!SHIPMENT_TRANSITIONS[shipment.status]?.includes(input.status)) throw new AppError("CONFLICT", "Invalid shipment status transition");

  if (input.status === "DELIVERED") {
    const items = await tx.select({ variantId: orderItems.variantId, quantity: orderItems.quantity, title: orderItems.title })
      .from(orderItems).where(and(eq(orderItems.orderId, shipment.orderId), eq(orderItems.sellerId, shipment.sellerId)));
    for (const item of items) {
      const updated = await tx.update(inventory).set({
        onHand: sql`${inventory.onHand} - ${item.quantity}`,
        reserved: sql`${inventory.reserved} - ${item.quantity}`,
        updatedAt: new Date(),
      }).where(and(eq(inventory.variantId, item.variantId), gte(inventory.onHand, item.quantity), gte(inventory.reserved, item.quantity)))
        .returning({ variantId: inventory.variantId });
      if (!updated.length) throw new AppError("CONFLICT", `Inventory could not be finalized for ${item.title}`);
      await tx.insert(inventoryMovements).values({
        variantId: item.variantId, movementType: "SALE", quantity: item.quantity,
        referenceType: "SHIPMENT_DELIVERED", referenceId: shipment.orderId,
        notes: "Inventory finalized on delivery", createdByUserId: input.actorUserId,
      });
    }
  }
  // A parcel refused at the door and back with the seller (RTO): its stock is
  // free to sell again. Otherwise failure or cancellation doesn't release
  // stock: the reservation belongs to the order and is released once by order
  // cancellation (which skips parcels already delivered or back), or
  // finalised on delivery.
  if (input.status === "RETURNED" && shipment.status !== "DELIVERED") {
    const items = await tx.select({ variantId: orderItems.variantId, quantity: orderItems.quantity, title: orderItems.title })
      .from(orderItems).where(and(eq(orderItems.orderId, shipment.orderId), eq(orderItems.sellerId, shipment.sellerId)));
    for (const item of items) {
      const released = await tx.update(inventory).set({ reserved: sql`${inventory.reserved} - ${item.quantity}`, updatedAt: new Date() })
        .where(and(eq(inventory.variantId, item.variantId), gte(inventory.reserved, item.quantity))).returning({ variantId: inventory.variantId });
      if (!released.length) throw new AppError("CONFLICT", `Inventory reservation could not be released for ${item.title}`);
      await tx.insert(inventoryMovements).values({
        variantId: item.variantId, movementType: "RELEASE", quantity: item.quantity,
        referenceType: "SHIPMENT_RTO", referenceId: shipment.orderId,
        notes: "Parcel refused and returned to the seller", createdByUserId: input.actorUserId,
      });
    }
  }

  const updated = (await tx.update(shipments).set({ status: input.status as typeof shipments.$inferSelect.status, updatedAt: new Date() })
    .where(and(eq(shipments.id, shipment.id), eq(shipments.status, shipment.status)))
    .returning({ id: shipments.id, status: shipments.status, orderId: shipments.orderId }))[0];
  if (!updated) throw new AppError("CONFLICT", "Shipment changed before it could be updated");
  // A cancelled or failed LOIMART parcel gives the wallet part of its courier fee back.
  if (input.status === "CANCELLED" || input.status === "FAILED") await refundCourierToWallet(tx, shipment.id, input.actorUserId);
  // A referred seller's first delivered order earns the seller who referred them extra free months.
  if (input.status === "DELIVERED") await rewardReferralOnFirstDelivery(tx, shipment.sellerId);
  // The seller's invoice is issued when the parcel leaves with the courier (GST: invoice by the time goods are removed).
  if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(input.status)) await issueSellerInvoice(tx, { orderId: shipment.orderId, sellerId: shipment.sellerId, actorUserId: input.actorUserId });
  // A parcel that comes back reverses its invoice.
  if (input.status === "RETURNED") await issueCreditNote(tx, { orderId: shipment.orderId, sellerId: shipment.sellerId, sourceKey: `RTO:${shipment.id}`, reason: shipment.status === "DELIVERED" ? "Goods returned" : "Parcel not delivered (returned to seller)", actorUserId: input.actorUserId });
  // Sent back after delivery and after the seller was already paid: recover that money and give back the commission.
  if (input.status === "RETURNED" && shipment.status === "DELIVERED") {
    const lines = await tx.select({ id: orderItems.id, quantity: orderItems.quantity }).from(orderItems).where(and(eq(orderItems.orderId, shipment.orderId), eq(orderItems.sellerId, shipment.sellerId)));
    await recordReturnAfterSettlement(tx, { sellerId: shipment.sellerId, sourceKey: `RTO:${shipment.id}`, quantities: new Map(lines.map((l) => [l.id, l.quantity])), actorUserId: input.actorUserId });
  }
  await tx.insert(shipmentEvents).values({ shipmentId: shipment.id, status: input.status as typeof shipments.$inferSelect.status, description: input.notes ?? "Shipment status updated" });
  await syncOrderFulfillmentStatus(tx, shipment.orderId);
  await tx.insert(auditLogs).values({
    actorUserId: input.actorUserId, action: "SHIPMENT_STATUS_" + input.status, entityType: "shipment", entityId: shipment.id,
    metadata: { orderId: shipment.orderId, from: shipment.status, to: input.status, notes: input.notes ?? null },
  });
  return updated;
}
