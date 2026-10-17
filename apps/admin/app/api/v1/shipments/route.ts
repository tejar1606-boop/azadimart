import { requireStaff } from "@azadimart/auth";
import { createDatabase, orders, sellers, shipments } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request:Request){
  const requestId=crypto.randomUUID();
  try{
    await requireStaff(request, ["logistics", "orders"]);
    const db=createDatabase();
    const rows=await db.select({
      id:shipments.id,orderId:shipments.orderId,orderNumber:orders.orderNumber,
      sellerId:shipments.sellerId,sellerName:sellers.storeName,status:shipments.status,
      awb:shipments.awb,providerShipmentId:shipments.providerShipmentId,courierName:shipments.courierName,
      shippedBy:shipments.shippedBy,shippingFeePaise:shipments.shippingFeePaise,
      destination:orders.shippingAddressSnapshot,orderStatus:orders.status,
      createdAt:shipments.createdAt,updatedAt:shipments.updatedAt,
    }).from(shipments)
      .innerJoin(orders,eq(orders.id,shipments.orderId))
      .innerJoin(sellers,eq(sellers.id,shipments.sellerId))
      .orderBy(desc(shipments.updatedAt));
    // City/PIN only: operations doesn't need the customer's full address here.
    return NextResponse.json({items:rows.map(({destination,...r})=>({...r,destination:{city:destination.city,state:destination.state,postalCode:destination.postalCode}}))});
  }catch(error){
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
