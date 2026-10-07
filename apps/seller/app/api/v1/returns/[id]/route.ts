import { requireApiAccess } from "@azadimart/auth";
import {
  auditLogs,
  createDatabase,
  inventory,
  inventoryMovements,
  orderItems,
  orders,
  returnItems,
  returns,
  sellers,
} from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

const transitions: Record<string, string[]> = {
  REQUESTED: ["APPROVED", "REJECTED"],
  APPROVED: ["PICKUP_SCHEDULED", "REJECTED"],
  PICKUP_SCHEDULED: ["RECEIVED", "REJECTED"],
  RECEIVED: [],
  REFUNDED: [],
  REJECTED: [],
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { id } = await context.params;
    const db = createDatabase();
    const rows = await db.select({
      id: returns.id,
      orderId: returns.orderId,
      sellerId: returns.sellerId,
      status: returns.status,
      reason: returns.reason,
      createdAt: returns.createdAt,
      updatedAt: returns.updatedAt,
      orderItemId: returnItems.orderItemId,
      quantity: returnItems.quantity,
      itemReason: returnItems.reason,
    }).from(returns)
      .innerJoin(returnItems, eq(returnItems.returnId, returns.id))
      .where(and(eq(returns.id, id), eq(returns.sellerId, principal.sellerId)));
    return NextResponse.json({ items: rows });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { id: returnId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(returnId)) throw new AppError("VALIDATION_ERROR", "A valid return ID is required");

    const body = (await request.json().catch(() => ({}))) as { status?: string; notes?: string };
    const nextStatus = body.status?.trim().toUpperCase();
    if (!nextStatus || !["APPROVED","PICKUP_SCHEDULED","RECEIVED","REJECTED"].includes(nextStatus)) {
      throw new AppError("VALIDATION_ERROR", "Invalid return status");
    }

    const db = createDatabase();
    const result = await db.transaction(async (tx) => {
      const seller = (await tx.select({ id: sellers.id, status: sellers.status })
        .from(sellers).where(and(eq(sellers.id, principal.sellerId!), eq(sellers.userId, principal.userId))).limit(1))[0];
      if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");

      const current = (await tx.select({
        id: returns.id,
        orderId: returns.orderId,
        sellerId: returns.sellerId,
        status: returns.status,
      }).from(returns).where(and(eq(returns.id, returnId), eq(returns.sellerId, principal.sellerId!))).limit(1))[0];
      if (!current) throw new AppError("NOT_FOUND", "Return request not found");
      if (current.status === nextStatus) return { id: current.id, status: current.status };
      if (!transitions[current.status]?.includes(nextStatus)) {
        throw new AppError("CONFLICT", `Cannot move return from ${current.status} to ${nextStatus}`);
      }

      if (nextStatus === "RECEIVED") {
        const items = await tx.select({
          variantId: orderItems.variantId,
          quantity: returnItems.quantity,
          title: orderItems.title,
        }).from(returnItems)
          .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
          .where(eq(returnItems.returnId, current.id));

        for (const item of items) {
          await tx.update(inventory).set({
            onHand: sql`${inventory.onHand} + ${item.quantity}`,
            updatedAt: new Date(),
          }).where(eq(inventory.variantId, item.variantId));
          await tx.insert(inventoryMovements).values({
            variantId: item.variantId,
            movementType: "RETURN",
            quantity: item.quantity,
            referenceType: "CUSTOMER_RETURN",
            referenceId: current.orderId,
            notes: body.notes?.trim().slice(0, 500) || "Returned item received",
            createdByUserId: principal.userId,
          });
        }
      }

      const updated = (await tx.update(returns).set({
        status: nextStatus as typeof returns.$inferInsert.status,
        reason: body.notes?.trim().slice(0, 500) || undefined,
        updatedAt: new Date(),
      }).where(and(eq(returns.id, current.id), eq(returns.status, current.status)))
        .returning({ id: returns.id, status: returns.status }))[0];
      if (!updated) throw new AppError("CONFLICT", "Return changed; please retry");

      let orderStatus: string | null = null;
      if (nextStatus === "RECEIVED") {
        const allItems = await tx.select({ id: orderItems.id, quantity: orderItems.quantity })
          .from(orderItems).where(eq(orderItems.orderId, current.orderId));
        const returnedRows = await tx.select({
          orderItemId: returnItems.orderItemId,
          quantity: returnItems.quantity,
        }).from(returnItems)
          .innerJoin(returns, eq(returns.id, returnItems.returnId))
          .where(and(
            eq(returns.orderId, current.orderId),
            inArray(returns.status, ["RECEIVED", "REFUNDED"]),
          ));
        const totals = new Map<string, number>();
        for (const row of returnedRows) totals.set(row.orderItemId, (totals.get(row.orderItemId) ?? 0) + row.quantity);
        if (allItems.length > 0 && allItems.every((item) => (totals.get(item.id) ?? 0) >= item.quantity)) {
          await tx.update(orders).set({ status: "RETURNED", updatedAt: new Date() })
            .where(and(eq(orders.id, current.orderId), eq(orders.status, "DELIVERED")));
          orderStatus = "RETURNED";
        }
      }

      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: "RETURN_STATUS_CHANGED",
        entityType: "return",
        entityId: current.id,
        metadata: { orderId: current.orderId, from: current.status, to: nextStatus },
      });

      return { id: updated.id, status: updated.status, orderStatus };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
