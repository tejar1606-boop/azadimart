import { AppError, type RefundDestination } from "@azadimart/shared";
import { refundWalletForOrder } from "./customer-wallet";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  couponRedemptions,
  coupons,
  customerWalletEntries,
  inventory,
  inventoryMovements,
  orderItems,
  orders,
  payments,
  refunds,
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
 *
 * An order paid online is refunded in full: to the shopper's LOIMART wallet at
 * once (`refundTo: "WALLET"`, the shopper's choice when they cancel), or back to
 * the original payment method (the default). That refund is recorded here as
 * PENDING; the caller sends it to the payment gateway after commit
 * (`sendPendingRefund`).
 */
export async function cancelOrderInTransaction(
  tx: Tx,
  input: { orderId: string; fromStatus: string; actorUserId: string; reason: string; referenceType: string; by: "CUSTOMER" | "SELLER" | "ADMIN" | "SYSTEM"; refundTo?: RefundDestination },
): Promise<{ paymentStatus: string | null; refund: { id: string; to: RefundDestination; amountPaise: number; status: string } | null }> {
  const activeShipment = (await tx
    .select({ id: shipments.id })
    .from(shipments)
    .where(and(eq(shipments.orderId, input.orderId), inArray(shipments.status, [...ACTIVE_SHIPMENT_STATUSES])))
    .limit(1))[0];
  if (activeShipment) {
    throw new AppError("CONFLICT", "This order can no longer be cancelled because seller fulfillment has started");
  }

  const capturedPayment = (await tx
    .select({ id: payments.id, provider: payments.provider, amountPaise: payments.amountPaise })
    .from(payments)
    .where(and(eq(payments.orderId, input.orderId), inArray(payments.status, ["AUTHORIZED", "CAPTURED", "PARTIALLY_REFUNDED"])))
    .limit(1))[0];
  // Cash on Delivery is only collected at delivery, so a cancellable order can't have been paid that way.
  if (capturedPayment?.provider === "COD") {
    throw new AppError("CONFLICT", "Refund the captured payment before cancelling this order");
  }

  const items = await tx
    .select({ variantId: orderItems.variantId, quantity: orderItems.quantity, title: orderItems.title, sellerId: orderItems.sellerId })
    .from(orderItems)
    .where(eq(orderItems.orderId, input.orderId));
  if (!items.length) throw new AppError("CONFLICT", "Order has no items to cancel");
  // Parcels already delivered (stock sold) or refused and back with the seller (released then) hold no reservation.
  const settled = new Set((await tx.select({ sellerId: shipments.sellerId }).from(shipments)
    .where(and(eq(shipments.orderId, input.orderId), inArray(shipments.status, ["DELIVERED", "RETURNED"])))).map((s) => s.sellerId));

  for (const item of items.filter((i) => !settled.has(i.sellerId))) {
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

  // Wallet money used on the order goes back to the shopper's wallet.
  await refundWalletForOrder(tx, input.orderId);

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

  const refund = capturedPayment ? await refundCancelledOrder(tx, { orderId: input.orderId, paymentId: capturedPayment.id, paymentAmountPaise: capturedPayment.amountPaise, to: input.refundTo ?? "SOURCE" }) : null;

  const payment = (await tx
    .select({ status: payments.status })
    .from(payments)
    .where(eq(payments.orderId, input.orderId))
    .limit(1))[0];
  return { paymentStatus: payment?.status ?? null, refund };
}

/** What's still refundable on an online payment goes to the wallet now, or is queued for the gateway. Once per order. */
async function refundCancelledOrder(tx: Tx, input: { orderId: string; paymentId: string; paymentAmountPaise: number; to: RefundDestination }) {
  const key = `cancel:${input.orderId}`;
  const existing = (await tx.select().from(refunds).where(eq(refunds.idempotencyKey, key)).limit(1))[0];
  if (existing) return { id: existing.id, to: existing.providerRefundId?.startsWith("WALLET:") ? "WALLET" as const : "SOURCE" as const, amountPaise: existing.amountPaise, status: existing.status };
  const committed = Number((await tx.select({ n: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` }).from(refunds)
    .where(and(eq(refunds.paymentId, input.paymentId), sql`${refunds.status} <> 'FAILED'`)))[0]?.n ?? 0);
  const amountPaise = input.paymentAmountPaise - committed;
  if (amountPaise <= 0) return null;

  if (input.to === "WALLET") {
    const [order] = await tx.select({ customerId: orders.customerId, orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, input.orderId));
    const [row] = await tx.insert(refunds).values({ paymentId: input.paymentId, orderId: input.orderId, amountPaise, status: "COMPLETED", idempotencyKey: key, reason: "Order cancelled · refunded to the LOIMART wallet", providerRefundId: `WALLET:${input.orderId}` }).returning();
    // Real money the shopper paid: no expiry, and all of it can be used on one order.
    await tx.insert(customerWalletEntries).values({ customerId: order!.customerId, kind: "CANCEL_REFUND", amountPaise, remainingPaise: amountPaise, fullUse: true, orderId: input.orderId, note: `Refund for cancelled order ${order!.orderNumber}` });
    await tx.update(payments).set({ status: committed + amountPaise >= input.paymentAmountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED", updatedAt: new Date() }).where(eq(payments.id, input.paymentId));
    return { id: row!.id, to: "WALLET" as const, amountPaise, status: "COMPLETED" };
  }
  const [row] = await tx.insert(refunds).values({ paymentId: input.paymentId, orderId: input.orderId, amountPaise, status: "PENDING", idempotencyKey: key, reason: "Order cancelled · back to the original payment method" }).returning();
  return { id: row!.id, to: "SOURCE" as const, amountPaise, status: "PENDING" };
}

/**
 * Sends a PENDING refund to the payment gateway (after the cancellation has
 * committed). If the gateway isn't set up or refuses, it stays PENDING for the
 * Payments team to retry or pay by bank transfer, and nothing is lost.
 */
export async function sendPendingRefund(db: Database, refundId: string, gateway: (provider: string) => { isConfigured: boolean; refund(providerPaymentId: string, amountPaise: number, idempotencyKey: string): Promise<{ providerRefundId: string }> }) {
  const claimed = await db.transaction(async (tx) => {
    const [r] = await tx.select({ id: refunds.id, amountPaise: refunds.amountPaise, idempotencyKey: refunds.idempotencyKey, paymentId: refunds.paymentId, provider: payments.provider, providerPaymentId: payments.providerPaymentId })
      .from(refunds).innerJoin(payments, eq(payments.id, refunds.paymentId)).where(and(eq(refunds.id, refundId), eq(refunds.status, "PENDING"))).for("update");
    if (!r?.providerPaymentId || r.provider === "COD" || !gateway(r.provider).isConfigured) return null;
    await tx.update(refunds).set({ status: "PROCESSING", updatedAt: new Date() }).where(eq(refunds.id, r.id));
    return r;
  });
  if (!claimed) return { sent: false as const };
  let providerRefundId: string;
  try {
    ({ providerRefundId } = await gateway(claimed.provider).refund(claimed.providerPaymentId!, claimed.amountPaise, claimed.idempotencyKey));
  } catch (error) {
    await db.update(refunds).set({ status: "PENDING", updatedAt: new Date() }).where(and(eq(refunds.id, claimed.id), eq(refunds.status, "PROCESSING")));
    return { sent: false as const, error: error instanceof Error ? error.message : "The payment gateway refused the refund" };
  }
  await completeRefund(db, claimed.id, providerRefundId);
  return { sent: true as const };
}

/** Records a refund as paid (by the gateway, or by bank transfer/UPI with its reference) and updates the payment. */
export async function completeRefund(db: Database, refundId: string, providerRefundId: string) {
  return db.transaction(async (tx) => {
    const [r] = await tx.update(refunds).set({ status: "COMPLETED", providerRefundId, updatedAt: new Date() })
      .where(and(eq(refunds.id, refundId), inArray(refunds.status, ["PENDING", "PROCESSING"]))).returning();
    if (!r) throw new AppError("CONFLICT", "This refund is already done or has changed");
    const [pay] = await tx.select({ amountPaise: payments.amountPaise }).from(payments).where(eq(payments.id, r.paymentId));
    const [done] = await tx.select({ n: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` }).from(refunds).where(and(eq(refunds.paymentId, r.paymentId), eq(refunds.status, "COMPLETED")));
    await tx.update(payments).set({ status: Number(done?.n ?? 0) >= pay!.amountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED", updatedAt: new Date() }).where(eq(payments.id, r.paymentId));
    return r;
  });
}
