import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, orderItems, orders, shipmentEvents, shipments, sellers } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");

    const body = (await request.json().catch(() => ({}))) as { orderId?: string };
    if (!body.orderId || !/^[0-9a-f-]{36}$/i.test(body.orderId)) {
      throw new AppError("VALIDATION_ERROR", "A valid order ID is required");
    }

    const db = createDatabase();
    const seller = (await db.select({ id:sellers.id,status:sellers.status }).from(sellers)
      .where(and(eq(sellers.id,principal.sellerId),eq(sellers.userId,principal.userId))).limit(1))[0];
    if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");

    const ownership = await db.select({ orderId:orderItems.orderId })
      .from(orderItems).innerJoin(orders,eq(orders.id,orderItems.orderId))
      .where(and(eq(orderItems.orderId,body.orderId),eq(orderItems.sellerId,principal.sellerId)))
      .limit(1);
    if (!ownership.length) throw new AppError("NOT_FOUND","Order not found for this seller");

    if (!["CONFIRMED","PACKED"].includes((await db.select({status:orders.status}).from(orders).where(eq(orders.id,body.orderId)).limit(1))[0]?.status ?? "")) {
      throw new AppError("CONFLICT","Order is not ready for seller fulfillment");
    }

    const existing = (await db.select({ id:shipments.id, status:shipments.status, providerShipmentId:shipments.providerShipmentId })
      .from(shipments).where(and(eq(shipments.orderId,body.orderId),eq(shipments.sellerId,principal.sellerId))).limit(1))[0];
    if (existing) return NextResponse.json({ shipment: existing });

    const providerShipmentId = "manual_" + body.orderId + "_" + principal.sellerId.slice(0,8);
    const shipment = (await db.insert(shipments).values({
      orderId:body.orderId,
      sellerId:principal.sellerId,
      status:"CREATED",
      providerShipmentId,
    }).returning({ id:shipments.id,status:shipments.status,providerShipmentId:shipments.providerShipmentId }))[0];
    if (!shipment) throw new AppError("INTERNAL","Shipment creation failed",undefined,false);

    await db.insert(shipmentEvents).values({ shipmentId:shipment.id, status:"CREATED", description:"Shipment created for seller fulfillment" });

    await db.insert(auditLogs).values({
      actorUserId:principal.userId,
      action:"SHIPMENT_CREATED",
      entityType:"shipment",
      entityId:shipment.id,
      metadata:{ orderId:body.orderId, sellerId:principal.sellerId, provider:"MANUAL" },
    });

    return NextResponse.json({ shipment }, { status:201 });
  } catch(error) {
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const db=createDatabase();
    const items=await db.select({
      id:shipments.id,orderId:shipments.orderId,status:shipments.status,
      providerShipmentId:shipments.providerShipmentId,awb:shipments.awb,
      createdAt:shipments.createdAt,updatedAt:shipments.updatedAt,
    }).from(shipments).where(eq(shipments.sellerId,principal.sellerId));
    return NextResponse.json({items});
  } catch(error) {
    const {status,body}=toApiError(error,requestId);
    return NextResponse.json(body,{status});
  }
}
