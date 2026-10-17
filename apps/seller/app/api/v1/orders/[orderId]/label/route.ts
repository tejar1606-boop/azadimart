import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderItems, orders, payments, productVariants, sellerSettings, sellers, shipments } from "@azadimart/database";
import { AppError, sellerShippingSettingsSchema, toApiError } from "@azadimart/shared";
import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

const ACTIVE = ["CONFIRMED", "PAID", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"];

/**
 * Everything for the printable shipping label + packing slip of this seller's
 * part of an order: ship-to (only while it still has to be shipped), ship-from
 * (the seller's pickup address), items, weight, and the cash to collect.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { orderId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new AppError("NOT_FOUND", "Order not found");
    const db = createDatabase();
    const seller = (await db.select({ id: sellers.id, status: sellers.status, storeName: sellers.storeName, gstin: sellers.gstin })
      .from(sellers).where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
    if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");

    const order = (await db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, createdAt: orders.createdAt, address: orders.shippingAddressSnapshot,
      grandTotalPaise: orders.grandTotalPaise, discountPaise: orders.discountPaise, shippingPaise: orders.shippingPaise, paymentMethod: payments.provider, paymentStatus: payments.status })
      .from(orders).leftJoin(payments, eq(payments.orderId, orders.id)).where(eq(orders.id, orderId)).limit(1))[0];
    const items = order ? await db.select({ title: orderItems.title, sku: orderItems.sku, quantity: orderItems.quantity, unitPricePaise: orderItems.unitPricePaise, weightGrams: productVariants.weightGrams, variant: productVariants.title })
      .from(orderItems).leftJoin(productVariants, eq(productVariants.id, orderItems.variantId))
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.sellerId, seller.id))) : [];
    if (!order || !items.length) throw new AppError("NOT_FOUND", "Order not found");
    if (!ACTIVE.includes(order.status)) throw new AppError("CONFLICT", "Labels are only available for orders that still need to be shipped");

    const [settingsRow, others, shipment] = await Promise.all([
      db.select({ shippingSettings: sellerSettings.shippingSettings }).from(sellerSettings).where(eq(sellerSettings.sellerId, seller.id)).limit(1).then((r) => r[0]),
      db.select({ quantity: orderItems.quantity, unitPricePaise: orderItems.unitPricePaise }).from(orderItems).where(and(eq(orderItems.orderId, orderId), ne(orderItems.sellerId, seller.id))),
      db.select({ courierName: shipments.courierName, awb: shipments.awb, status: shipments.status, shippedBy: shipments.shippedBy }).from(shipments).where(and(eq(shipments.orderId, orderId), eq(shipments.sellerId, seller.id))).limit(1).then((r) => r[0] ?? null),
    ]);
    const pickup = sellerShippingSettingsSchema.safeParse(settingsRow?.shippingSettings);
    const mine = items.reduce((n, i) => n + i.quantity * i.unitPricePaise, 0);
    const othersTotal = others.reduce((n, i) => n + i.quantity * i.unitPricePaise, 0);
    const share = othersTotal ? mine / (mine + othersTotal) : 1;
    const cod = order.paymentMethod === "COD" && !["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(order.paymentStatus ?? "");
    const a = order.address;

    return NextResponse.json({
      orderNumber: order.orderNumber,
      orderedAt: order.createdAt,
      shipTo: { name: a.name ?? "Customer", phone: a.phone ?? null, line1: a.line1, line2: a.line2 ?? null, city: a.city, state: a.state, postalCode: a.postalCode },
      shipFrom: pickup.success ? { storeName: seller.storeName, ...pickup.data.pickup, gstin: seller.gstin } : null,
      items: items.map((i) => ({ title: i.title, variant: i.variant && i.variant !== "Default" ? i.variant : null, sku: i.sku, quantity: i.quantity, unitPricePaise: i.unitPricePaise })),
      weightGrams: items.reduce((n, i) => n + i.quantity * (i.weightGrams ?? 0), 0),
      payment: cod ? { mode: "COD", collectPaise: share === 1 ? order.grandTotalPaise : Math.max(0, mine - Math.round(order.discountPaise * share) + Math.round(order.shippingPaise * share)) } : { mode: "PREPAID", collectPaise: 0 },
      shipment,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
