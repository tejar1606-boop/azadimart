import { requireApiAccess } from "@azadimart/auth";
import { advanceShipmentStatus, auditLogs, createDatabase, shipmentEvents, shipments, sellers } from "@azadimart/database";
import { AppError, shipmentStatusUpdateSchema, shipmentTrackingSchema, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shipmentId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { shipmentId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(shipmentId)) throw new AppError("VALIDATION_ERROR", "A valid shipment ID is required");
    const input = shipmentStatusUpdateSchema.parse(await request.json());

    const db = createDatabase();
    const result = await db.transaction(async (tx) => {
      const seller = (await tx.select({ id: sellers.id, status: sellers.status })
        .from(sellers).where(and(eq(sellers.id, principal.sellerId!), eq(sellers.userId, principal.userId))).limit(1))[0];
      if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");
      const own = (await tx.select({ shippedBy: shipments.shippedBy }).from(shipments).where(and(eq(shipments.id, shipmentId), eq(shipments.sellerId, principal.sellerId!))).limit(1))[0];
      if (!own) throw new AppError("NOT_FOUND", "Shipment not found");
      // LOIMART-shipped parcels are updated by the courier / LOIMART team, not the seller.
      if (own.shippedBy === "LOIMART") throw new AppError("CONFLICT", "LOIMART updates this shipment as the courier moves it");
      return advanceShipmentStatus(tx, { shipmentId, status: input.status, actorUserId: principal.userId, notes: input.notes ?? null, sellerId: principal.sellerId! });
    });

    return NextResponse.json({ ok: true, shipment: result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/**
 * Courier name and tracking (AWB) number for a manual shipment, so the
 * customer can track the parcel. Can be corrected until it's delivered.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ shipmentId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { shipmentId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(shipmentId)) throw new AppError("VALIDATION_ERROR", "A valid shipment ID is required");
    const input = shipmentTrackingSchema.parse(await request.json());
    const db = createDatabase();
    const seller = (await db.select({ id: sellers.id, status: sellers.status })
      .from(sellers).where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
    if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");
    const shipment = (await db.select({ id: shipments.id, orderId: shipments.orderId, status: shipments.status, providerShipmentId: shipments.providerShipmentId })
      .from(shipments).where(and(eq(shipments.id, shipmentId), eq(shipments.sellerId, principal.sellerId))).limit(1))[0];
    if (!shipment) throw new AppError("NOT_FOUND", "Shipment not found");
    if (!shipment.providerShipmentId?.startsWith("manual_")) throw new AppError("CONFLICT", "Tracking for courier-booked shipments comes from the courier");
    if (!["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(shipment.status)) throw new AppError("CONFLICT", "This shipment can't be changed any more");
    const updated = await db.transaction(async (tx) => {
      const row = (await tx.update(shipments).set({ courierName: input.courierName, awb: input.awb, updatedAt: new Date() })
        .where(and(eq(shipments.id, shipment.id), eq(shipments.sellerId, principal.sellerId!)))
        .returning({ id: shipments.id, status: shipments.status, courierName: shipments.courierName, awb: shipments.awb }))[0];
      await tx.insert(shipmentEvents).values({ shipmentId: shipment.id, status: shipment.status, description: `Shipped with ${input.courierName}, tracking no. ${input.awb}` });
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "SHIPMENT_TRACKING_SET", entityType: "shipment", entityId: shipment.id, metadata: { orderId: shipment.orderId, ...input } });
      return row;
    });
    return NextResponse.json({ ok: true, shipment: updated });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
