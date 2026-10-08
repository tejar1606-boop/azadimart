import { requireApiAccess } from "@azadimart/auth";
import {
  couponRedemptions,
  coupons,
  createDatabase,
  inventory,
  inventoryMovements,
  orderItems,
  orders,
  payments,
  shipments,
} from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!principal.customerId) {
      throw new AppError("UNAUTHORIZED", "Customer profile required");
    }

    const { orderId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      throw new AppError("VALIDATION_ERROR", "A valid order ID is required");
    }

    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason?.trim().slice(0, 500) || "Cancelled by customer";

    const db = createDatabase();

    const result = await db.transaction(async (tx) => {
      // Serialize customer cancellation with seller shipment reservation for this
      // order. This prevents a cancellation and shipment creation from crossing
      // each other between their eligibility check and the state mutation.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orderId}, 0))`);

      const order = (
        await tx
          .select({
            id: orders.id,
            status: orders.status,
            couponCode: orders.couponCode,
          })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.customerId, principal.customerId!)))
          .limit(1)
      )[0];

      if (!order) {
        throw new AppError("NOT_FOUND", "Order not found");
      }

      if (order.status !== "CONFIRMED") {
        throw new AppError(
          "CONFLICT",
          "This order can no longer be cancelled",
        );
      }

      const activeShipment = (
        await tx
          .select({ id: shipments.id })
          .from(shipments)
          .where(and(
            eq(shipments.orderId, order.id),
            inArray(shipments.status, [
              "PENDING",
              "CREATED",
              "PICKED_UP",
              "IN_TRANSIT",
              "OUT_FOR_DELIVERY",
            ]),
          ))
          .limit(1)
      )[0];
      if (activeShipment) {
        throw new AppError(
          "CONFLICT",
          "This order can no longer be cancelled because seller fulfillment has started",
        );
      }

      const items = await tx
        .select({
          orderItemId: orderItems.id,
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
          title: orderItems.title,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      if (!items.length) {
        throw new AppError("CONFLICT", "Order has no items to cancel");
      }

      for (const item of items) {
        const released = await tx
          .update(inventory)
          .set({
            reserved: sql`${inventory.reserved} - ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventory.variantId, item.variantId),
              gte(inventory.reserved, item.quantity),
            ),
          )
          .returning({ variantId: inventory.variantId });

        if (!released.length) {
          throw new AppError(
            "CONFLICT",
            `Inventory reservation could not be released for ${item.title}`,
          );
        }

        await tx.insert(inventoryMovements).values({
          variantId: item.variantId,
          movementType: "RELEASE",
          quantity: item.quantity,
          referenceType: "ORDER_CANCELLATION",
          referenceId: order.id,
          notes: reason,
          createdByUserId: principal.userId,
        });
      }

      if (order.couponCode) {
        const redemption = (
          await tx
            .select({ couponId: couponRedemptions.couponId })
            .from(couponRedemptions)
            .where(
              and(
                eq(couponRedemptions.orderId, order.id),
                eq(couponRedemptions.customerId, principal.customerId!),
              ),
            )
            .limit(1)
        )[0];

        if (redemption) {
          await tx.delete(couponRedemptions).where(eq(couponRedemptions.orderId, order.id));
          await tx
            .update(coupons)
            .set({
              usageCount: sql`greatest(${coupons.usageCount} - 1, 0)`,
              updatedAt: new Date(),
            })
            .where(eq(coupons.id, redemption.couponId));
        }
      }

      const updated = (
        await tx
          .update(orders)
          .set({ status: "CANCELLED", updatedAt: new Date() })
          .where(
            and(
              eq(orders.id, order.id),
              eq(orders.customerId, principal.customerId!),
              eq(orders.status, order.status),
            ),
          )
          .returning({ id: orders.id, status: orders.status })
      )[0];

      if (!updated) {
        throw new AppError("CONFLICT", "Order status changed; please try again");
      }

      const payment = (
        await tx
          .select({ id: payments.id, status: payments.status })
          .from(payments)
          .where(eq(payments.orderId, order.id))
          .limit(1)
      )[0];

      return {
        orderId: updated.id,
        status: updated.status,
        paymentStatus: payment?.status ?? null,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
