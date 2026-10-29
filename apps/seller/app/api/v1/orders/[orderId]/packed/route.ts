import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, orderItems, orders } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Seller marks an order as packed (Confirmed → Packed, "ready to dispatch"). Only for orders with just this seller's items. */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { orderId } = await params;
    if (!uuidSchema.safeParse(orderId).success) throw new AppError("NOT_FOUND", "Order not found");
    const db = createDatabase();
    const order = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orderId}, 0))`);
      const mine = await tx.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.sellerId, principal.sellerId!))).limit(1);
      if (!mine.length) throw new AppError("NOT_FOUND", "Order not found");
      const others = await tx.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, orderId), ne(orderItems.sellerId, principal.sellerId!))).limit(1);
      if (others.length) throw new AppError("CONFLICT", "This order includes other sellers' items; create your shipment when ready instead");
      const updated = (await tx.update(orders).set({ status: "PACKED", packedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, "CONFIRMED"))).returning({ id: orders.id, orderNumber: orders.orderNumber }))[0];
      if (!updated) throw new AppError("CONFLICT", "Only confirmed orders can be marked as packed");
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "ORDER_PACKED", entityType: "order", entityId: orderId, metadata: { orderNumber: updated.orderNumber } });
      return updated;
    });
    return NextResponse.json({ ok: true, order: { ...order, status: "PACKED" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
