import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, orderItems, orders, productVariants, sellerSettings, shipmentEvents, shipments, sellers } from "@azadimart/database";
import { createShipmentForOrder, getLogisticsProvider, type Address } from "@azadimart/logistics";
import { AppError, sellerShippingSettingsSchema, toApiError } from "@azadimart/shared";
import { and, countDistinct, eq } from "drizzle-orm";
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

    const orderRow = (await db.select({
      id:orders.id,
      status:orders.status,
      shippingAddressSnapshot:orders.shippingAddressSnapshot,
    }).from(orders)
      .innerJoin(orderItems,eq(orderItems.orderId,orders.id))
      .where(and(eq(orders.id,body.orderId),eq(orderItems.sellerId,principal.sellerId)))
      .limit(1))[0];
    if (!orderRow) throw new AppError("NOT_FOUND","Order not found for this seller");
    if (!["CONFIRMED","PACKED"].includes(orderRow.status)) {
      throw new AppError("CONFLICT","Order is not ready for seller fulfillment");
    }

    const rawSettings = (await db.select({ shippingSettings:sellerSettings.shippingSettings })
      .from(sellerSettings).where(eq(sellerSettings.sellerId,principal.sellerId)).limit(1))[0]?.shippingSettings;
    if (!rawSettings) {
      throw new AppError("CONFLICT","Configure your pickup address before creating shipments");
    }
    const settings = sellerShippingSettingsSchema.parse(rawSettings);
    const provider = getLogisticsProvider(settings.preferredProvider);
    if (!provider.isConfigured) {
      throw new AppError("CONFLICT", settings.preferredProvider + " logistics is not configured yet");
    }

    const existing = (await db.select({
      id:shipments.id,
      status:shipments.status,
      providerShipmentId:shipments.providerShipmentId,
      awb:shipments.awb,
    }).from(shipments)
      .where(and(eq(shipments.orderId,body.orderId),eq(shipments.sellerId,principal.sellerId))).limit(1))[0];
    if (existing && existing.status !== "FAILED") {
      return NextResponse.json({ shipment: existing });
    }

    const sellerItems = await db.select({
      quantity: orderItems.quantity,
      unitPricePaise: orderItems.unitPricePaise,
      weightGrams: productVariants.weightGrams,
    }).from(orderItems)
      .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
      .where(and(eq(orderItems.orderId, body.orderId), eq(orderItems.sellerId, principal.sellerId)));

    const declaredValuePaise = sellerItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPricePaise,
      0,
    );
    const weightGrams = sellerItems.reduce(
      (sum, item) => sum + item.quantity * item.weightGrams,
      0,
    );
    if (weightGrams <= 0) {
      throw new AppError("CONFLICT", "Add package weight to every product variant before creating a shipment");
    }
    const deliverySnapshot = orderRow.shippingAddressSnapshot;
    const delivery: Address = {
      name: deliverySnapshot.name ?? "Customer",
      phone: deliverySnapshot.phone ?? "",
      line1: deliverySnapshot.line1,
      city: deliverySnapshot.city,
      state: deliverySnapshot.state,
      postalCode: deliverySnapshot.postalCode,
      country: "IN",
    };
    if (!delivery.phone) throw new AppError("CONFLICT","Customer delivery phone is missing from the order snapshot");

    const reservationRows = existing
      ? await db.update(shipments)
          .set({ status: "PENDING", providerShipmentId: null, awb: null, updatedAt: new Date() })
          .where(and(eq(shipments.id, existing.id), eq(shipments.status, "FAILED"), eq(shipments.sellerId, principal.sellerId)))
          .returning({ id: shipments.id })
      : await db.insert(shipments).values({
          orderId: body.orderId,
          sellerId: principal.sellerId,
          status: "PENDING",
        }).onConflictDoNothing({
          target: [shipments.orderId, shipments.sellerId],
        }).returning({ id: shipments.id });

    const reserved = reservationRows[0];
    if (!reserved) {
      const concurrent = (await db.select({
        id: shipments.id,
        status: shipments.status,
        providerShipmentId: shipments.providerShipmentId,
        awb: shipments.awb,
      }).from(shipments).where(and(eq(shipments.orderId, body.orderId), eq(shipments.sellerId, principal.sellerId))).limit(1))[0];
      if (!concurrent) throw new AppError("INTERNAL", "Shipment reservation failed", undefined, false);
      return NextResponse.json({ shipment: concurrent });
    }

    let created: Awaited<ReturnType<typeof createShipmentForOrder>>;
    try {
      created = await createShipmentForOrder(settings.preferredProvider, {
        orderId: body.orderId,
        sellerId: principal.sellerId,
        pickup: settings.pickup,
        delivery,
        weightGrams,
        declaredValuePaise,
        idempotencyKey: body.orderId + ":" + principal.sellerId,
      });
    } catch (error) {
      await db.update(shipments)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(and(eq(shipments.id, reserved.id), eq(shipments.sellerId, principal.sellerId)));
      await db.insert(shipmentEvents).values({
        shipmentId: reserved.id,
        status: "FAILED",
        description: error instanceof Error ? error.message : "Shipment provider failed",
      });
      throw error;
    }

    const shipment = (await db.update(shipments).set({
      status: "CREATED",
      providerShipmentId: created.providerShipmentId,
      awb: created.awb ?? null,
      updatedAt: new Date(),
    }).where(and(eq(shipments.id, reserved.id), eq(shipments.sellerId, principal.sellerId))).returning({
      id: shipments.id,
      status: shipments.status,
      providerShipmentId: shipments.providerShipmentId,
      awb: shipments.awb,
    }))[0];
    if (!shipment) throw new AppError("INTERNAL","Shipment finalization failed",undefined,false);

    await db.insert(shipmentEvents).values({ shipmentId:shipment.id, status:"CREATED", description:"Shipment created through " + created.provider });

    await db.insert(auditLogs).values({
      actorUserId:principal.userId,
      action:"SHIPMENT_CREATED",
      entityType:"shipment",
      entityId:shipment.id,
      metadata:{ orderId:body.orderId, sellerId:principal.sellerId, provider:created.provider },
    });

    // A marketplace order is SHIPPED only after every seller involved has a
    // successfully created shipment. Until then it remains CONFIRMED/PACKED.
    const sellerCount = Number(
      (await db
        .select({ count: countDistinct(orderItems.sellerId) })
        .from(orderItems)
        .where(eq(orderItems.orderId, body.orderId)))[0]?.count ?? 0,
    );
    const createdShipmentSellerCount = Number(
      (await db
        .select({ count: countDistinct(shipments.sellerId) })
        .from(shipments)
        .where(
          and(
            eq(shipments.orderId, body.orderId),
            eq(shipments.status, "CREATED"),
          ),
        ))[0]?.count ?? 0,
    );
    if (sellerCount > 0 && createdShipmentSellerCount === sellerCount) {
      await db
        .update(orders)
        .set({ status: "SHIPPED", updatedAt: new Date() })
        .where(
          and(
            eq(orders.id, body.orderId),
            eq(orders.status, "PACKED"),
          ),
        );
    }

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
