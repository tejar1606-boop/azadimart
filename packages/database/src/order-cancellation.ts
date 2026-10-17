import { AppError } from "@azadimart/shared";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  couponRedemptions,
  coupons,
  inventory,
  inventoryMovements,
  orderItems,
  orders,
  payments,
  shipments,
} from "./schema/index";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const ACTIVE_SHIPMENT_STATUSES = ["PENDING", "CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] as const;

/**
 * Cancel an order inside the caller's transaction. This is the single place
 * that releases the checkout stock reservation, so customer and admin
 * cancellation cannot diverge or double-release. The caller must hold the
 * per-order advisory lock and has already checked who may cancel and from
 * which status.
 */
export async function cancelOrderInTransaction(
  tx: Tx,
  input: { orderId: string; fromStatus: string; actorUserId: string; reason: string; referenceType: string; by: "CUSTOMER" | "SELLER" | "ADMIN" | "SYSTEM" },
): Promise<{ paymentStatus: string | null }> {
  const activeShipment = (await tx
    .select({ id: shipments.id })
    .from(shipments)
    .where(and(eq(shipments.orderId, input.orderId), inArray(shipments.status, [...ACTIVE_SHIPMENT_STATUSES])))
    .limit(1))[0];
  if (activeShipment) {
    throw new AppError("CONFLICT", "This order can no longer be cancelled because seller fulfillment has started");
  }

  const capturedPayment = (await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.orderId, input.orderId), inArray(payments.status, ["AUTHORIZED", "CAPTURED", "PARTIALLY_REFUNDED"])))
    .limit(1))[0];
  if (capturedPayment) {
    throw new AppError("CONFLICT", "Refund the captured payment before cancelling this order");
  }

  const items = await tx
    .select({ variantId: orderItems.variantId, quantity: orderItems.quantity, title: orderItems.title })
    .from(orderItems)
    .where(eq(orderItems.orderId, input.orderId));
  if (!items.length) throw new AppError("CONFLICT", "Order has no items to cancel");

  for (const item of items) {
    const released = await tx
      .update(inventory)
      .set({ reserved: sql`${inventory.reserved} - ${item.quantity}`, updatedAt: new Date() })
      .where(and(eq(inventory.variantId, item.variantId), gte(inventory.reserved, item.quantity)))
      .returning({ variantId: inventory.variantId });
    if (!released.length) {
      throw new AppError("CONFLICT", `Inventory reservation could not be released for ${item.title}`);
    }
    await tx.insert(inventoryMovements).values({
      variantId: item.variantId,
      movementType: "RELEASE",
      quantity: item.quantity,
      referenceType: input.referenceType,
      referenceId: input.orderId,
      notes: input.reason,
      createdByUserId: input.actorUserId,
    });
  }

  const redemptions = await tx
    .delete(couponRedemptions)
    .where(eq(couponRedemptions.orderId, input.orderId))
    .returning({ couponId: couponRedemptions.couponId });
  for (const redemption of redemptions) {
    await tx
      .update(coupons)
      .set({ usageCount: sql`greatest(${coupons.usageCount} - 1, 0)`, updatedAt: new Date() })
      .where(eq(coupons.id, redemption.couponId));
  }

  await tx
    .update(payments)
    .set({ status: "FAILED", updatedAt: new Date() })
    .where(and(eq(payments.orderId, input.orderId), eq(payments.status, "PENDING")));

  const updated = (await tx
    .update(orders)
    .set({
      status: "CANCELLED", updatedAt: new Date(),
      // Who cancelled and why: shown to the customer and used for seller performance.
      cancelledAt: new Date(), cancelledBy: input.by, cancellationReason: input.reason,
      cancelRequestedAt: null, cancelRequestedBySellerId: null, cancelRequestReason: null,
    })
    .where(and(eq(orders.id, input.orderId), sql`${orders.status} = ${input.fromStatus}`))
    .returning({ id: orders.id }))[0];
  if (!updated) throw new AppError("CONFLICT", "Order status changed; please try again");

  const payment = (await tx
    .select({ status: payments.status })
    .from(payments)
    .where(eq(payments.orderId, input.orderId))
    .limit(1))[0];
  return { paymentStatus: payment?.status ?? null };
}
