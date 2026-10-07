import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, inventory, orderItems, orders, payments } from "@azadimart/database";
import { AppError, orderStatusUpdateSchema, toApiError } from "@azadimart/shared";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

const transitions: Record<string, string[]> = {
  CREATED: ["CONFIRMED", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "CANCELLED"],
  PAID: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { orderId } = await params;
    const input = orderStatusUpdateSchema.parse(await request.json());
    const db = createDatabase();

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${orderId}, 0)
        )
      `);

      const order = (await tx.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1))[0];
      if (!order) throw new AppError("NOT_FOUND", "Order not found");
      if (!transitions[order.status]?.includes(input.status)) throw new AppError("CONFLICT", "Invalid order status transition");

      if (input.status === "CANCELLED") {
        const items = await tx.select({ variantId: orderItems.variantId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, order.id));
        for (const item of items) {
          const released = await tx.update(inventory).set({ reserved: sql`GREATEST(0, ${inventory.reserved} - ${item.quantity})`, updatedAt: new Date() }).where(eq(inventory.variantId, item.variantId)).returning({ variantId: inventory.variantId });
          if (!released.length) throw new AppError("CONFLICT", "Inventory record is missing for a cancelled item");
        }
        await tx.update(payments).set({ status: "FAILED", updatedAt: new Date() }).where(and(eq(payments.orderId, order.id), eq(payments.status, "PENDING")));
      }

      const updated = (await tx.update(orders).set({ status: input.status, updatedAt: new Date() }).where(and(eq(orders.id, order.id), eq(orders.status, order.status))).returning({ id: orders.id, status: orders.status, orderNumber: orders.orderNumber }))[0];
      if (!updated) throw new AppError("CONFLICT", "Order changed before it could be updated");

      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: "ORDER_STATUS_" + input.status,
        entityType: "order",
        entityId: order.id,
        metadata: { orderNumber: order.orderNumber, from: order.status, to: input.status, notes: input.notes ?? null },
      });
      return updated;
    });

    return NextResponse.json({ ok: true, order: result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}