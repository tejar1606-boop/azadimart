import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderItems, orders, payments, products, sellers } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const db = createDatabase();
    const seller = (await db.select({ id:sellers.id,status:sellers.status }).from(sellers).where(eq(sellers.id, principal.sellerId)).limit(1))[0];
    if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");

    const rows = await db.select({
      id:orders.id,orderNumber:orders.orderNumber,status:orders.status,grandTotalPaise:orders.grandTotalPaise,
      discountPaise:orders.discountPaise,couponCode:orders.couponCode,createdAt:orders.createdAt,
      orderItemId:orderItems.id,productTitle:orderItems.title,sku:orderItems.sku,quantity:orderItems.quantity,unitPricePaise:orderItems.unitPricePaise,
      productId:orderItems.productId,paymentStatus:payments.status,
    }).from(orderItems)
      .innerJoin(orders,eq(orders.id,orderItems.orderId))
      .leftJoin(payments,eq(payments.orderId,orders.id))
      .where(eq(orderItems.sellerId, principal.sellerId))
      .orderBy(desc(orders.createdAt));

    return NextResponse.json({ items:rows });
  } catch(error) {
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
