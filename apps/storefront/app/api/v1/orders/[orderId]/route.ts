import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderCashbackState, orderInvoices, orderItems, orders, payments, refunds, sellers, products } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, asc, eq } from "drizzle-orm";
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
      subtotalPaise: orders.subtotalPaise, discountPaise: orders.discountPaise, walletPaise: orders.walletPaise,
      shippingPaise: orders.shippingPaise, platformFeePaise: orders.platformFeePaise, grandTotalPaise: orders.grandTotalPaise, cashbackPaise: orders.cashbackPaise, deliveredAt: orders.deliveredAt,
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

    // Invoices (one per seller, issued when the parcel ships) and any credit notes.
    const invoices = (await orderInvoices(db, order.id)).map((inv) => ({ ...inv, sellerName: items.find((i) => i.sellerId === inv.sellerId)?.sellerName ?? null }));
    const cashback = await orderCashbackState(db, order);
    // A cancelled prepaid order's refund: to the wallet, or back to the original payment method.
    const [cancelRefund] = order.status === "CANCELLED" ? await db.select({ amountPaise: refunds.amountPaise, status: refunds.status, providerRefundId: refunds.providerRefundId })
      .from(refunds).where(and(eq(refunds.orderId, order.id), eq(refunds.idempotencyKey, `cancel:${order.id}`))).limit(1) : [];
    const refund = cancelRefund ? { to: cancelRefund.providerRefundId?.startsWith("WALLET:") ? "WALLET" : "SOURCE", amountPaise: cancelRefund.amountPaise, status: cancelRefund.status } : null;
    return NextResponse.json({ order: { ...order, items, invoices, cashback, refund } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
