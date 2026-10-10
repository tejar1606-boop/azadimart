import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, cancelOrderInTransaction, createDatabase, orders } from "@azadimart/database";
import { notifySellersOfCancellation } from "@azadimart/notify";
import { AppError, orderStatusUpdateSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// SHIPPED / OUT_FOR_DELIVERY / DELIVERED are derived from sellers' shipments
// (which also finalize inventory on delivery) and RETURNED from the returns
// flow, so admins cannot set them by hand and strand reserved stock.
const transitions: Record<string, string[]> = {
  CREATED: ["CONFIRMED", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "CANCELLED"],
  PAID: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PACKED: ["CANCELLED"],
};

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { orderId } = await params;
    if (!uuidSchema.safeParse(orderId).success) throw new AppError("NOT_FOUND", "Order not found");
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

      let updated: { id: string; status: string; orderNumber: string } | undefined;
      if (input.status === "CANCELLED") {
        await cancelOrderInTransaction(tx, {
          orderId: order.id,
          fromStatus: order.status,
          actorUserId: principal.userId,
          reason: input.notes ?? "Cancelled by AzadiMart",
          referenceType: "ADMIN_ORDER_CANCELLATION",
          by: "ADMIN",
        });
        updated = { id: order.id, status: "CANCELLED", orderNumber: order.orderNumber };
      } else {
        updated = (await tx.update(orders).set({ status: input.status, updatedAt: new Date() }).where(and(eq(orders.id, order.id), eq(orders.status, order.status))).returning({ id: orders.id, status: orders.status, orderNumber: orders.orderNumber }))[0];
      }
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

    if (input.status === "CANCELLED") await notifySellersOfCancellation(db, result.id, "ADMIN", input.notes ?? null);
    return NextResponse.json({ ok: true, order: result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}