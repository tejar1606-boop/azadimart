import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderItems, orders, payments } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const db = createDatabase();
    const rows = await db.select({
      id:orders.id,orderNumber:orders.orderNumber,status:orders.status,subtotalPaise:orders.subtotalPaise,
      discountPaise:orders.discountPaise,shippingPaise:orders.shippingPaise,grandTotalPaise:orders.grandTotalPaise,
      currency:orders.currency,couponCode:orders.couponCode,createdAt:orders.createdAt,paymentStatus:payments.status,
    }).from(orders).leftJoin(payments,eq(payments.orderId,orders.id))
      .where(eq(orders.customerId,session.customerId)).orderBy(desc(orders.createdAt));

    const orderIds = rows.map(order=>order.id);
    const items=orderIds.length?await db.select({
      orderId:orderItems.orderId,title:orderItems.title,sku:orderItems.sku,quantity:orderItems.quantity,
      unitPricePaise:orderItems.unitPricePaise,
    }).from(orderItems)
      .where(inArray(orderItems.orderId,orderIds)):[];
    const firstItems=new Map<string,typeof items[number]>();
    for(const item of items) if(!firstItems.has(item.orderId)) firstItems.set(item.orderId,item);
    return NextResponse.json({items:rows.map(order=>({...order,firstItem:firstItems.get(order.id)??null}))});
  } catch(error){
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
