import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderItems, orders, payments, sellers, products } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const { orderId } = await params;
    const db = createDatabase();

    const order = (await db.select({
      id: orders.id, customerId: orders.customerId, orderNumber: orders.orderNumber, status: orders.status,
      subtotalPaise: orders.subtotalPaise, discountPaise: orders.discountPaise,
      shippingPaise: orders.shippingPaise, grandTotalPaise: orders.grandTotalPaise,
      couponCode: orders.couponCode, shippingAddressSnapshot: orders.shippingAddressSnapshot,
      currency: orders.currency, createdAt: orders.createdAt, cancelledBy: orders.cancelledBy, cancellationReason: orders.cancellationReason, paymentStatus: payments.status, paymentMethod: payments.provider,
    }).from(orders).leftJoin(payments, eq(payments.orderId, orders.id))
      .where(eq(orders.id, orderId)).limit(1))[0];

    if (!order || order.customerId !== session.customerId) throw new AppError("NOT_FOUND", "Order not found");

    const items = await db.select({
      id: orderItems.id, sellerId: orderItems.sellerId, sellerName: sellers.storeName,
      title: orderItems.title, sku: orderItems.sku, quantity: orderItems.quantity,
      unitPricePaise: orderItems.unitPricePaise, productSlug: products.slug,
    }).from(orderItems).innerJoin(sellers, eq(sellers.id, orderItems.sellerId)).innerJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt));

    return NextResponse.json({ order: { ...order, items } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
