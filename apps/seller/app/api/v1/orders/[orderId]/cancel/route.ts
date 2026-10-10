import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { auditLogs, cancelOrderInTransaction, createDatabase, orderItems, orders, sellers } from "@azadimart/database";
import { AppError, sellerCancelSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Seller cancels an unshipped order with a reason (Amazon/Flipkart style).
 * If the order also has other sellers' items, the seller can't cancel it
 * alone: a cancellation request is recorded for AzadiMart to decide.
 * Stock is released by the shared cancellation function.
 */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const sellerId = principal.sellerId;
    const { orderId } = await params;
    if (!uuidSchema.safeParse(orderId).success) throw new AppError("NOT_FOUND", "Order not found");
    const input = sellerCancelSchema.parse(await request.json());
    const reason = input.note ? `${input.reason}: ${input.note}` : input.reason;
    const db = createDatabase();
    await enforceRateLimit(db, request, "sellerCancel", { subject: principal.userId, rule: { limit: 30, windowSeconds: 60 * 60 } });
    const seller = (await db.select({ status: sellers.status }).from(sellers).where(eq(sellers.id, sellerId)).limit(1))[0];
    if (seller?.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");

    const result = await db.transaction(async (tx) => {
      // Same per-order lock as customer cancellation and shipment creation.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orderId}, 0))`);
      const order = (await tx.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1).for("update"))[0];
      const mine = order ? await tx.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.sellerId, sellerId))).limit(1) : [];
      if (!order || !mine.length) throw new AppError("NOT_FOUND", "Order not found");
      if (!["CONFIRMED", "PACKED"].includes(order.status)) throw new AppError("CONFLICT", "Only orders that haven't shipped can be cancelled");
      const others = await tx.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, orderId), ne(orderItems.sellerId, sellerId))).limit(1);

      if (others.length) {
        await tx.update(orders).set({ cancelRequestedAt: new Date(), cancelRequestedBySellerId: sellerId, cancelRequestReason: reason, updatedAt: new Date() }).where(eq(orders.id, orderId));
        await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "ORDER_CANCEL_REQUESTED_BY_SELLER", entityType: "order", entityId: orderId, metadata: { orderNumber: order.orderNumber, reason } });
        return { outcome: "REQUESTED" as const, orderNumber: order.orderNumber };
      }
      await cancelOrderInTransaction(tx, { orderId, fromStatus: order.status, actorUserId: principal.userId, reason, referenceType: "SELLER_ORDER_CANCELLATION", by: "SELLER" });
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "ORDER_CANCELLED_BY_SELLER", entityType: "order", entityId: orderId, metadata: { orderNumber: order.orderNumber, reason } });
      return { outcome: "CANCELLED" as const, orderNumber: order.orderNumber };
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.outcome === "REQUESTED" ? 202 : 200 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
