import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderItems, orders, payments, sellers } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
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
      id:orders.id,orderNumber:orders.orderNumber,status:orders.status,
      couponCode:orders.couponCode,createdAt:orders.createdAt,
      shipByAt:orders.shipByAt,packedAt:orders.packedAt,cancelledBy:orders.cancelledBy,cancellationReason:orders.cancellationReason,
      cancelRequestedAt:orders.cancelRequestedAt,cancelRequestedBySellerId:orders.cancelRequestedBySellerId,cancelRequestReason:orders.cancelRequestReason,
      orderItemId:orderItems.id,productTitle:orderItems.title,sku:orderItems.sku,quantity:orderItems.quantity,unitPricePaise:orderItems.unitPricePaise,
      productId:orderItems.productId,paymentStatus:payments.status,
    }).from(orderItems)
      .innerJoin(orders,eq(orders.id,orderItems.orderId))
      .leftJoin(payments,eq(payments.orderId,orders.id))
      .where(eq(orderItems.sellerId, principal.sellerId))
      .orderBy(desc(orders.createdAt));

    // Totals cover only this seller's lines: an order can include other
    // sellers' items, whose amounts must not be exposed here.
    const sellerTotals = new Map<string, number>();
    for (const row of rows) sellerTotals.set(row.id, (sellerTotals.get(row.id) ?? 0) + row.unitPricePaise * row.quantity);
    // Orders that also contain other sellers' items: this seller can't cancel them alone (they request it instead).
    const orderIds=[...new Set(rows.map((row)=>row.id))];
    const shared=new Set(orderIds.length?(await db.selectDistinct({id:orderItems.orderId}).from(orderItems).where(and(inArray(orderItems.orderId,orderIds),ne(orderItems.sellerId,principal.sellerId)))).map((r)=>r.id):[]);
    return NextResponse.json({ items:rows.map(({cancelRequestedBySellerId,...row})=>({ ...row, sellerSubtotalPaise: sellerTotals.get(row.id) ?? 0, sharedWithOtherSellers: shared.has(row.id), cancelRequestedByMe: cancelRequestedBySellerId===principal.sellerId })) });
  } catch(error) {
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
