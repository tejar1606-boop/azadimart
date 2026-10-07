import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orders, shipmentEvents, shipments } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request:Request,{params}:{params:Promise<{orderId:string}>}) {
  const requestId=crypto.randomUUID();
  try {
    const session=await requireApiAccess(request,"storefront",["CUSTOMER"]);
    if(!session.customerId) throw new AppError("UNAUTHORIZED","Customer profile required");
    const {orderId}=await params;
    const db=createDatabase();

    const ownsOrder=(await db.select({id:shipments.id})
      .from(shipments).innerJoin(orders,eq(orders.id,shipments.orderId))
      .where(and(eq(shipments.orderId,orderId),eq(orders.customerId,session.customerId)))
      .limit(1))[0];
    if(!ownsOrder && !(await db.select({id:orders.id}).from(orders).where(and(eq(orders.id,orderId),eq(orders.customerId,session.customerId))).limit(1)).length) {
      throw new AppError("NOT_FOUND","Order not found");
    }

    const rows=await db.select({
      shipmentId:shipments.id,sellerId:shipments.sellerId,shipmentStatus:shipments.status,
      awb:shipments.awb,providerShipmentId:shipments.providerShipmentId,
      eventId:shipmentEvents.id,eventStatus:shipmentEvents.status,eventDescription:shipmentEvents.description,
      eventCreatedAt:shipmentEvents.createdAt,
    }).from(shipments).leftJoin(shipmentEvents,eq(shipmentEvents.shipmentId,shipments.id))
      .where(eq(shipments.orderId,orderId)).orderBy(asc(shipmentEvents.createdAt));

    const byShipment=new Map<string,{shipmentId:string;sellerId:string;status:string;awb:string|null;providerShipmentId:string|null;events:{id:string;status:string;description:string|null;createdAt:Date}[]}>();
    for(const row of rows){
      let entry=byShipment.get(row.shipmentId);
      if(!entry){entry={shipmentId:row.shipmentId,sellerId:row.sellerId,status:row.shipmentStatus,awb:row.awb,providerShipmentId:row.providerShipmentId,events:[]};byShipment.set(row.shipmentId,entry);}
      if(row.eventId&&row.eventCreatedAt&&row.eventStatus){
        entry.events.push({id:row.eventId,status:row.eventStatus,description:row.eventDescription,createdAt:row.eventCreatedAt});
      }
    }
    return NextResponse.json({shipments:Array.from(byShipment.values())});
  } catch(error) {
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
