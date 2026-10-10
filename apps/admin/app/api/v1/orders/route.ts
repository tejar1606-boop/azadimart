import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderItems, orders, payments, sellers } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();

    const rows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        status: orders.status,
        subtotalPaise: orders.subtotalPaise,
        discountPaise: orders.discountPaise,
        shippingPaise: orders.shippingPaise,
        grandTotalPaise: orders.grandTotalPaise,
        couponCode: orders.couponCode,
        createdAt: orders.createdAt,
        shipByAt: orders.shipByAt,
        cancelledBy: orders.cancelledBy,
        cancellationReason: orders.cancellationReason,
        cancelRequestedAt: orders.cancelRequestedAt,
        cancelRequestReason: orders.cancelRequestReason,
        orderItemId: orderItems.id,
        sellerId: orderItems.sellerId,
        sellerName: sellers.storeName,
        itemCount: orderItems.quantity,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .leftJoin(sellers, eq(sellers.id, orderItems.sellerId))
      .orderBy(desc(orders.createdAt));

    // Payments are fetched separately: an order can have several payment
    // attempts, and joining them multiplied item rows (inflated item counts).
    const orderIds = [...new Set(rows.map((row) => row.id))];
    const paymentRows = orderIds.length
      ? await db.select({ orderId: payments.orderId, status: payments.status })
        .from(payments).where(inArray(payments.orderId, orderIds)).orderBy(desc(payments.createdAt))
      : [];
    const latestPayment = new Map<string, string>();
    for (const payment of paymentRows) if (!latestPayment.has(payment.orderId)) latestPayment.set(payment.orderId, payment.status);

    const grouped = new Map<string, typeof rows[number] & { paymentStatus: string | null; sellers: Set<string>; sellerNames: Set<string>; itemCountTotal: number }>();
    for (const row of rows) {
      const existing = grouped.get(row.id);
      if (existing) {
        if (row.sellerId) existing.sellers.add(row.sellerId);
        if (row.sellerName) existing.sellerNames.add(row.sellerName);
        existing.itemCountTotal += row.itemCount ?? 0;
      } else {
        grouped.set(row.id, {
          ...row,
          paymentStatus: latestPayment.get(row.id) ?? null,
          sellers: new Set(row.sellerId ? [row.sellerId] : []),
          sellerNames: new Set(row.sellerName ? [row.sellerName] : []),
          itemCountTotal: row.itemCount ?? 0,
        });
      }
    }

    return NextResponse.json({
      items: [...grouped.values()].map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        status: order.status,
        subtotalPaise: order.subtotalPaise,
        discountPaise: order.discountPaise,
        shippingPaise: order.shippingPaise,
        grandTotalPaise: order.grandTotalPaise,
        couponCode: order.couponCode,
        createdAt: order.createdAt,
        shipByAt: order.shipByAt,
        cancelledBy: order.cancelledBy,
        cancellationReason: order.cancellationReason,
        cancelRequestedAt: order.cancelRequestedAt,
        cancelRequestReason: order.cancelRequestReason,
        paymentStatus: order.paymentStatus,
        sellerCount: order.sellers.size,
        sellers: [...order.sellerNames],
        itemCount: order.itemCountTotal,
      })),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
