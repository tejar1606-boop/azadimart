import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderItems, orders, payments, sellers } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

type Snapshot = { name?: string; phone?: string | null; line1: string; line2?: string | null; city: string; state: string; postalCode: string; country: string };
/** Statuses where the seller still has to ship or hand over the parcel. */
const ACTIVE = new Set(["CONFIRMED", "PAID", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"]);

/**
 * Where to send the parcel. The full name, phone and address show only while
 * the seller has to ship it; after delivery or cancellation just the city and
 * PIN stay (the customer's details aren't kept on show).
 */
function shipToFor(status: string, a: Snapshot) {
  if (ACTIVE.has(status)) return { full: true, name: a.name ?? "Customer", phone: a.phone ?? null, line1: a.line1, line2: a.line2 ?? null, city: a.city, state: a.state, postalCode: a.postalCode };
  return { full: false, name: null, phone: null, line1: null, line2: null, city: a.city, state: a.state, postalCode: a.postalCode };
}

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
      productId:orderItems.productId,paymentStatus:payments.status,paymentMethod:payments.provider,
      shippingAddress:orders.shippingAddressSnapshot,grandTotalPaise:orders.grandTotalPaise,discountPaise:orders.discountPaise,shippingPaise:orders.shippingPaise,
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
    // Order totals (all sellers) to work out this seller's share of the cash to collect.
    const orderTotals=new Map<string,number>();
    if(shared.size){
      const all=await db.select({orderId:orderItems.orderId,quantity:orderItems.quantity,unitPricePaise:orderItems.unitPricePaise}).from(orderItems).where(inArray(orderItems.orderId,[...shared]));
      for(const r of all)orderTotals.set(r.orderId,(orderTotals.get(r.orderId)??0)+r.quantity*r.unitPricePaise);
    }
    return NextResponse.json({ items:rows.map(({cancelRequestedBySellerId,shippingAddress,grandTotalPaise,discountPaise,shippingPaise,...row})=>{
      const mine=sellerTotals.get(row.id)??0;
      const share=shared.has(row.id)&&orderTotals.get(row.id)?mine/orderTotals.get(row.id)!:1;
      // Cash on Delivery: what the courier collects for this seller's parcel (their share when several sellers ship one order).
      const codCollectPaise=row.paymentMethod==="COD"&&!["CAPTURED","REFUNDED","PARTIALLY_REFUNDED"].includes(row.paymentStatus??"")
        ?(share===1?grandTotalPaise:Math.max(0,mine-Math.round(discountPaise*share)+Math.round(shippingPaise*share))):null;
      return { ...row, sellerSubtotalPaise: mine, sharedWithOtherSellers: shared.has(row.id), cancelRequestedByMe: cancelRequestedBySellerId===principal.sellerId, shipTo: shipToFor(row.status, shippingAddress), codCollectPaise };
    }) });
  } catch(error) {
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
