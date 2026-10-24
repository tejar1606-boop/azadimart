import { requireStaff } from "@azadimart/auth";
import { advanceShipmentStatus, createDatabase, shipments } from "@azadimart/database";
import { AppError, shipmentStatusUpdateSchema, toApiError } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * LOIMART team updates a LOIMART-shipped parcel: the courier's progress
 * (until a real courier sends updates itself), or cancels a booking so the
 * seller can book again. Seller-shipped parcels are updated by the seller.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ shipmentId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const staff = await requireStaff(request, "logistics");
    const { shipmentId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(shipmentId)) throw new AppError("NOT_FOUND", "Shipment not found");
    const input = shipmentStatusUpdateSchema.parse(await request.json());
    const db = createDatabase();
    const result = await db.transaction(async (tx) => {
      const row = (await tx.select({ shippedBy: shipments.shippedBy }).from(shipments).where(eq(shipments.id, shipmentId)).limit(1))[0];
      if (!row) throw new AppError("NOT_FOUND", "Shipment not found");
      if (row.shippedBy !== "LOIMART") throw new AppError("CONFLICT", "The seller ships this parcel with their own courier and updates it");
      return advanceShipmentStatus(tx, { shipmentId, status: input.status, actorUserId: staff.userId, notes: input.notes ?? `Updated by LOIMART logistics` });
    });
    return NextResponse.json({ ok: true, shipment: result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
