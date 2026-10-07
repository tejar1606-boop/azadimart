import { requireApiAccess } from "@azadimart/auth";
import {
  auditLogs,
  createDatabase,
  inventory,
  inventoryMovements,
  orderItems,
  orders,
  shipmentEvents,
  shipments,
  sellers,
} from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq, gte, sql, countDistinct } from "drizzle-orm";
import { NextResponse } from "next/server";

const transitions: Record<string, string[]> = {
  PENDING: ["CREATED", "FAILED", "CANCELLED"],
  CREATED: ["PICKED_UP", "FAILED", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "FAILED", "RETURNED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  FAILED: ["PENDING"],
  RETURNED: [],
  CANCELLED: [],
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");

    const { id: shipmentId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(shipmentId)) {
      throw new AppError("VALIDATION_ERROR", "A valid shipment ID is required");
    }

    const body = (await request.json().catch(() => ({}))) as {
      status?: string;
      description?: string;
    };
    const nextStatus = body.status?.trim().toUpperCase();
    if (!nextStatus || !["PENDING","CREATED","PICKED_UP","IN_TRANSIT","OUT_FOR_DELIVERY","DELIVERED","FAILED","RETURNED","CANCELLED"].includes(nextStatus)) {
      throw new AppError("VALIDATION_ERROR", "A valid shipment status is required");
    }

    const db = createDatabase();
    const result = await db.transaction(async (tx) => {
      const seller = (await tx.select({ id: sellers.id, status: sellers.status })
        .from(sellers)
        .where(and(eq(sellers.id, principal.sellerId!), eq(sellers.userId, principal.userId)))
        .limit(1))[0];
      if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");

      const shipment = (await tx.select({
        id: shipments.id,
        orderId: shipments.orderId,
        sellerId: shipments.sellerId,
        status: shipments.status,
      }).from(shipments)
        .where(and(eq(shipments.id, shipmentId), eq(shipments.sellerId, principal.sellerId!)))
        .limit(1))[0];

      if (!shipment) throw new AppError("NOT_FOUND", "Shipment not found");
      if (shipment.status === nextStatus) {
        return { shipmentId: shipment.id, status: shipment.status, orderStatus: null };
      }
      if (!transitions[shipment.status]?.includes(nextStatus)) {
        throw new AppError("CONFLICT", `Cannot move shipment from ${shipment.status} to ${nextStatus}`);
      }

      if (nextStatus === "DELIVERED") {
        const items = await tx.select({
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
          title: orderItems.title,
        }).from(orderItems).where(
          and(eq(orderItems.orderId, shipment.orderId), eq(orderItems.sellerId, shipment.sellerId)),
        );

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
          if (!updated.length) {
            throw new AppError("CONFLICT", `Inventory could not be finalized for ${item.title}`);
          }
          await tx.insert(inventoryMovements).values({
            variantId: item.variantId,
            movementType: "SALE",
            quantity: item.quantity,
            referenceType: "SHIPMENT_DELIVERED",
            referenceId: shipment.orderId,
            notes: "Inventory finalized on delivery",
            createdByUserId: principal.userId,
          });
        }
      }

      if (nextStatus === "CANCELLED" || (nextStatus === "FAILED" && shipment.status !== "PICKED_UP")) {
        const items = await tx.select({
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
          title: orderItems.title,
        }).from(orderItems).where(
          and(eq(orderItems.orderId, shipment.orderId), eq(orderItems.sellerId, shipment.sellerId)),
        );
        for (const item of items) {
          const released = await tx.update(inventory).set({
            reserved: sql`${inventory.reserved} - ${item.quantity}`,
            updatedAt: new Date(),
          }).where(and(
            eq(inventory.variantId, item.variantId),
            gte(inventory.reserved, item.quantity),
          )).returning({ variantId: inventory.variantId });
          if (!released.length) throw new AppError("CONFLICT", `Inventory reservation could not be released for ${item.title}`);
          await tx.insert(inventoryMovements).values({
            variantId: item.variantId,
            movementType: "RELEASE",
            quantity: item.quantity,
            referenceType: "SHIPMENT_CANCELLATION",
            referenceId: shipment.orderId,
            notes: body.description?.trim().slice(0, 500) || "Shipment cancelled or failed before pickup",
            createdByUserId: principal.userId,
          });
        }
      }

      const updated = (await tx.update(shipments).set({
        status: nextStatus as typeof shipments.$inferInsert.status,
        updatedAt: new Date(),
      }).where(and(eq(shipments.id, shipment.id), eq(shipments.status, shipment.status))).returning({
        id: shipments.id,
        status: shipments.status,
        orderId: shipments.orderId,
      }))[0];
      if (!updated) throw new AppError("CONFLICT", "Shipment changed; please retry");

      await tx.insert(shipmentEvents).values({
        shipmentId: shipment.id,
        status: nextStatus as typeof shipmentEvents.$inferInsert.status,
        description: body.description?.trim().slice(0, 500) || `Shipment status changed to ${nextStatus}`,
      });

      let orderStatus: string | null = null;
      const total = Number((await tx.select({ count: countDistinct(shipments.sellerId) })
        .from(shipments).where(eq(shipments.orderId, shipment.orderId)))[0]?.count ?? 0);
      const delivered = Number((await tx.select({ count: countDistinct(shipments.sellerId) })
        .from(shipments).where(and(eq(shipments.orderId, shipment.orderId), eq(shipments.status, "DELIVERED"))))[0]?.count ?? 0);
      if (total > 0 && delivered === total) {
        await tx.update(orders).set({ status: "DELIVERED", updatedAt: new Date() })
          .where(and(eq(orders.id, shipment.orderId), eq(orders.status, "SHIPPED")));
        orderStatus = "DELIVERED";
      } else if (nextStatus === "OUT_FOR_DELIVERY") {
        await tx.update(orders).set({ status: "OUT_FOR_DELIVERY", updatedAt: new Date() })
          .where(and(eq(orders.id, shipment.orderId), eq(orders.status, "SHIPPED")));
        orderStatus = "OUT_FOR_DELIVERY";
      }

      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: "SHIPMENT_STATUS_CHANGED",
        entityType: "shipment",
        entityId: shipment.id,
        metadata: { orderId: shipment.orderId, from: shipment.status, to: nextStatus },
      });

      return { shipmentId: updated.id, status: updated.status, orderStatus };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
