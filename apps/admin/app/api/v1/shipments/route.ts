import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orders, sellers, shipments } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request:Request){
  const requestId=crypto.randomUUID();
  try{
    await requireApiAccess(request,"admin",["ADMIN","SUPER_ADMIN"]);
    const db=createDatabase();
    const rows=await db.select({
      id:shipments.id,orderId:shipments.orderId,orderNumber:orders.orderNumber,
      sellerId:shipments.sellerId,sellerName:sellers.storeName,status:shipments.status,
      awb:shipments.awb,providerShipmentId:shipments.providerShipmentId,
      createdAt:shipments.createdAt,updatedAt:shipments.updatedAt,
    }).from(shipments)
      .innerJoin(orders,eq(orders.id,shipments.orderId))
      .innerJoin(sellers,eq(sellers.id,shipments.sellerId))
      .orderBy(desc(shipments.updatedAt));
    return NextResponse.json({items:rows});
  }catch(error){
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
