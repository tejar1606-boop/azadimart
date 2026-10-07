import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderItems, orders, payments, sellers } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { desc, eq } from "drizzle-orm";
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
        paymentStatus: payments.status,
        sellerId: orderItems.sellerId,
        sellerName: sellers.storeName,
        itemCount: orderItems.quantity,
      })
      .from(orders)
      .leftJoin(payments, eq(payments.orderId, orders.id))
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .leftJoin(sellers, eq(sellers.id, orderItems.sellerId))
      .orderBy(desc(orders.createdAt));

    const grouped = new Map<string, typeof rows[number] & { sellers: Set<string>; sellerNames: Set<string>; itemCountTotal: number }>();
    for (const row of rows) {
      const existing = grouped.get(row.id);
      if (existing) {
        if (row.sellerId) existing.sellers.add(row.sellerId);
        if (row.sellerName) existing.sellerNames.add(row.sellerName);
        existing.itemCountTotal += row.itemCount ?? 0;
      } else {
        grouped.set(row.id, {
          ...row,
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
