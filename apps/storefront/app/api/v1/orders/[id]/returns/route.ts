import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderItems, orders, returnItems, returns } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!principal.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const { id: orderId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new AppError("VALIDATION_ERROR", "A valid order ID is required");

    const body = (await request.json().catch(() => ({}))) as {
      items?: Array<{ orderItemId?: string; quantity?: number; reason?: string }>;
      reason?: string;
    };
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new AppError("VALIDATION_ERROR", "At least one item is required");
    }

    const db = createDatabase();
    const result = await db.transaction(async (tx) => {
      const order = (await tx.select({
        id: orders.id,
        status: orders.status,
      }).from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, principal.customerId!))).limit(1))[0];
      if (!order) throw new AppError("NOT_FOUND", "Order not found");
      if (order.status !== "DELIVERED") throw new AppError("CONFLICT", "Returns can be requested only after delivery");

      const requestedIds = body.items.map((item) => item.orderItemId).filter((id): id is string => !!id);
      if (requestedIds.length !== body.items.length || requestedIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
        throw new AppError("VALIDATION_ERROR", "Each return item needs a valid order item ID");
      }
      if (new Set(requestedIds).size !== requestedIds.length) throw new AppError("VALIDATION_ERROR", "Duplicate return items are not allowed");

      const ownedItems = await tx.select({
        id: orderItems.id,
        sellerId: orderItems.sellerId,
        quantity: orderItems.quantity,
        title: orderItems.title,
      }).from(orderItems).where(and(eq(orderItems.orderId, order.id), inArray(orderItems.id, requestedIds)));
      if (ownedItems.length !== requestedIds.length) throw new AppError("NOT_FOUND", "One or more order items were not found");

      const priorRows = await tx.select({
        orderItemId: returnItems.orderItemId,
        quantity: returnItems.quantity,
      }).from(returnItems)
        .innerJoin(returns, eq(returns.id, returnItems.returnId))
        .where(and(eq(returns.orderId, order.id), inArray(returnItems.orderItemId, requestedIds), sql`${returns.status} <> 'REJECTED'`));

      const returnedByItem = new Map<string, number>();
      for (const row of priorRows) returnedByItem.set(row.orderItemId, (returnedByItem.get(row.orderItemId) ?? 0) + row.quantity);

      const itemMap = new Map(ownedItems.map((item) => [item.id, item]));
      const validated = body.items.map((input) => {
        const item = itemMap.get(input.orderItemId!);
        const quantity = Number(input.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > item!.quantity - (returnedByItem.get(item!.id) ?? 0)) {
          throw new AppError("UNPROCESSABLE", `Invalid return quantity for ${item!.title}`);
        }
        return { ...item!, quantity, reason: input.reason?.trim().slice(0, 500) || body.reason?.trim().slice(0, 500) || null };
      });

      const sellerIds = [...new Set(validated.map((item) => item.sellerId))];
      const created = [];
      for (const sellerId of sellerIds) {
        const sellerItems = validated.filter((item) => item.sellerId === sellerId);
        const ret = (await tx.insert(returns).values({
          orderId: order.id,
          sellerId,
          status: "REQUESTED",
          reason: body.reason?.trim().slice(0, 500) || null,
        }).returning({ id: returns.id, sellerId: returns.sellerId, status: returns.status }))[0];
        if (!ret) throw new AppError("INTERNAL", "Return request could not be created", undefined, false);
        await tx.insert(returnItems).values(sellerItems.map((item) => ({
          returnId: ret.id,
          orderItemId: item.id,
          quantity: item.quantity,
          reason: item.reason,
        })));
        created.push(ret);
      }
      return { returns: created };
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!principal.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const { id: orderId } = await context.params;
    const db = createDatabase();
    const rows = await db.select({
      id: returns.id,
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
      .innerJoin(orders, eq(orders.id, returns.orderId))
      .where(and(eq(returns.orderId, orderId), eq(orders.customerId, principal.customerId!)));
    return NextResponse.json({ items: rows });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
