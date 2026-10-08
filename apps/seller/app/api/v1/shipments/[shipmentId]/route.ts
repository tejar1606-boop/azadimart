import { requireApiAccess } from "@azadimart/auth";
import {
  auditLogs,
  createDatabase,
  inventory,
  inventoryMovements,
  orderItems,
  shipmentEvents,
  shipments,
  sellers,
} from "@azadimart/database";
import { AppError, shipmentStatusUpdateSchema, toApiError } from "@azadimart/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { syncOrderFulfillmentStatus } from "../order-fulfillment";

const transitions: Record<string, string[]> = {
  // PENDING is an internal reservation state. Shipment creation owns the provider call and the PENDING -> CREATED/FAILED transition, so a seller cannot race that external side effect with a manual status mutation.
  PENDING: [],
  CREATED: ["PICKED_UP", "FAILED", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "FAILED", "RETURNED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  FAILED: [],
  RETURNED: [],
  CANCELLED: [],
};

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

      const shipment = (await tx.select({
        id: shipments.id, orderId: shipments.orderId, sellerId: shipments.sellerId, status: shipments.status,
      }).from(shipments).where(and(eq(shipments.id, shipmentId), eq(shipments.sellerId, principal.sellerId!))).limit(1))[0];
      if (!shipment) throw new AppError("NOT_FOUND", "Shipment not found");
      if (!transitions[shipment.status]?.includes(input.status)) throw new AppError("CONFLICT", "Invalid shipment status transition");

      const items = await tx.select({
        variantId: orderItems.variantId, quantity: orderItems.quantity, title: orderItems.title,
      }).from(orderItems).where(and(eq(orderItems.orderId, shipment.orderId), eq(orderItems.sellerId, shipment.sellerId)));

      if (input.status === "DELIVERED") {
        for (const item of items) {
          const updated = await tx.update(inventory).set({
            onHand: sql`${inventory.onHand} - ${item.quantity}`,
            reserved: sql`${inventory.reserved} - ${item.quantity}`,
            updatedAt: new Date(),
          }).where(and(
            eq(inventory.variantId, item.variantId),
            gte(inventory.onHand, item.quantity),
            gte(inventory.reserved, item.quantity),
          )).returning({ variantId: inventory.variantId });
          if (!updated.length) throw new AppError("CONFLICT", `Inventory could not be finalized for ${item.title}`);
          await tx.insert(inventoryMovements).values({
            variantId: item.variantId, movementType: "SALE", quantity: item.quantity,
            referenceType: "SHIPMENT_DELIVERED", referenceId: shipment.orderId,
            notes: "Inventory finalized on delivery", createdByUserId: principal.userId,
          });
        }
      }

      // Shipment failure, cancellation or return does not release stock: the
      // checkout reservation belongs to the order and is released exactly once
      // by order cancellation (or finalized on delivery). Releasing here as
      // well double-counted stock when the order was later cancelled.

      const updated = (await tx.update(shipments).set({
        status: input.status, updatedAt: new Date(),
      }).where(and(eq(shipments.id, shipment.id), eq(shipments.sellerId, principal.sellerId!), eq(shipments.status, shipment.status)))
        .returning({ id: shipments.id, status: shipments.status, orderId: shipments.orderId }))[0];
      if (!updated) throw new AppError("CONFLICT", "Shipment changed before it could be updated");

      await tx.insert(shipmentEvents).values({
        shipmentId: shipment.id, status: input.status, description: input.notes ?? "Shipment status updated",
      });

      await syncOrderFulfillmentStatus(tx, shipment.orderId);

      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: "SHIPMENT_STATUS_" + input.status,
        entityType: "shipment",
        entityId: shipment.id,
        metadata: { orderId: shipment.orderId, from: shipment.status, to: input.status, notes: input.notes ?? null },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, shipment: result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
