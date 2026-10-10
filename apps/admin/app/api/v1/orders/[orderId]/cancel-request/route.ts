import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, cancelOrderInTransaction, createDatabase, orders } from "@azadimart/database";
import { notifySeller, notifySellersOfCancellation } from "@azadimart/notify";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Admin approves (cancels the whole order) or declines a seller's cancellation request on a shared order. */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { orderId } = await params;
    if (!uuidSchema.safeParse(orderId).success) throw new AppError("NOT_FOUND", "Order not found");
    const { decision } = (await request.json().catch(() => ({}))) as { decision?: string };
    if (decision !== "APPROVE" && decision !== "DECLINE") throw new AppError("VALIDATION_ERROR", "Choose approve or decline");
    const db = createDatabase();
    const order = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orderId}, 0))`);
      const current = (await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update"))[0];
      if (!current?.cancelRequestedAt) throw new AppError("NOT_FOUND", "No cancellation request on this order");
      if (decision === "APPROVE") {
        await cancelOrderInTransaction(tx, { orderId, fromStatus: current.status, actorUserId: principal.userId, reason: current.cancelRequestReason ?? "Cancelled at the seller's request", referenceType: "SELLER_REQUEST_CANCELLATION", by: "SELLER" });
      } else {
        await tx.update(orders).set({ cancelRequestedAt: null, cancelRequestedBySellerId: null, cancelRequestReason: null, updatedAt: new Date() }).where(eq(orders.id, orderId));
      }
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: decision === "APPROVE" ? "ORDER_CANCEL_REQUEST_APPROVED" : "ORDER_CANCEL_REQUEST_DECLINED", entityType: "order", entityId: orderId, metadata: { orderNumber: current.orderNumber, reason: current.cancelRequestReason } });
      return current;
    });
    if (decision === "APPROVE") await notifySellersOfCancellation(db, orderId, "ADMIN", order.cancelRequestReason);
    else if (order.cancelRequestedBySellerId) await notifySeller(db, { sellerId: order.cancelRequestedBySellerId, kind: "ORDER_CANCELLED_BY_ADMIN", dedupeKey: `REQ_DECLINED:${orderId}:${Date.now()}`, href: "/orders", title: `Cancellation request declined for ${order.orderNumber}`, body: "AzadiMart asked you to ship your items in this order. Contact support if you can't." });
    return NextResponse.json({ ok: true, decision });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
