import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, shipmentEvents, shipments } from "@azadimart/database";
import { AppError, shipmentStatusUpdateSchema, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const transitions: Record<string,string[]> = {
  CREATED:["PICKED_UP","CANCELLED"],
  PICKED_UP:["IN_TRANSIT","FAILED","CANCELLED"],
  IN_TRANSIT:["OUT_FOR_DELIVERY","FAILED","RETURNED"],
  OUT_FOR_DELIVERY:["DELIVERED","FAILED"],
  DELIVERED:["RETURNED"],
  FAILED:["PICKED_UP","CANCELLED"],
  RETURNED:[],
  CANCELLED:[],
};

export async function PATCH(request:Request,{params}:{params:Promise<{shipmentId:string}>}){
  const requestId=crypto.randomUUID();
  try{
    const principal=await requireApiAccess(request,"seller",["SELLER"]);
    if(!principal.sellerId)throw new AppError("FORBIDDEN","Seller profile is required");
    const {shipmentId}=await params;
    const input=shipmentStatusUpdateSchema.parse(await request.json());
    const db=createDatabase();
    const shipment=(await db.select({id:shipments.id,status:shipments.status,orderId:shipments.orderId})
      .from(shipments).where(and(eq(shipments.id,shipmentId),eq(shipments.sellerId,principal.sellerId))).limit(1))[0];
    if(!shipment)throw new AppError("NOT_FOUND","Shipment not found");
    if(!transitions[shipment.status]?.includes(input.status))throw new AppError("CONFLICT","Invalid shipment status transition");

    const updated=(await db.update(shipments).set({status:input.status,updatedAt:new Date()})
      .where(and(eq(shipments.id,shipment.id),eq(shipments.sellerId,principal.sellerId),eq(shipments.status,shipment.status)))
      .returning({id:shipments.id,status:shipments.status,orderId:shipments.orderId}))[0];
    if(!updated)throw new AppError("CONFLICT","Shipment changed before it could be updated");

    await db.insert(shipmentEvents).values({ shipmentId:shipment.id, status:input.status, description:input.notes ?? "Shipment status updated" });

    await db.insert(auditLogs).values({
      actorUserId:principal.userId,action:"SHIPMENT_STATUS_"+input.status,entityType:"shipment",entityId:shipment.id,
      metadata:{orderId:shipment.orderId,from:shipment.status,to:input.status,notes:input.notes??null},
    });
    return NextResponse.json({ok:true,shipment:updated});
  }catch(error){
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
