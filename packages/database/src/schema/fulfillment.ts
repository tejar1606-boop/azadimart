import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { payoutStatusEnum, returnStatusEnum, shipmentStatusEnum } from "./enums";
import { orders, orderItems, payments } from "./commerce";
import { sellers } from "./sellers";

export const deliveryProviders = pgTable(
  "delivery_providers",
  {
    id,
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    isActive: integer("is_active").notNull().default(1),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [uniqueIndex("delivery_providers_code_unique").on(table.code)],
);

export const shipments = pgTable(
  "shipments",
  {
    id,
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id),
    providerId: uuid("provider_id").references(() => deliveryProviders.id),
    status: shipmentStatusEnum("status").notNull().default("PENDING"),
    awb: text("awb"),
    providerShipmentId: text("provider_shipment_id"),
    ...timestamps,
  },
  (table) => [
    index("shipments_order_id_idx").on(table.orderId),
    index("shipments_seller_id_idx").on(table.sellerId),
  ],
);

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id,
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    status: shipmentStatusEnum("status").notNull(),
    description: text("description"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [index("shipment_events_shipment_id_idx").on(table.shipmentId)],
);

export const returns = pgTable(
  "returns",
  {
    id,
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    orderItemId: uuid("order_item_id").references(() => orderItems.id),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id),
    status: returnStatusEnum("status").notNull().default("REQUESTED"),
    reason: text("reason"),
    ...timestamps,
  },
  (table) => [
    index("returns_order_id_idx").on(table.orderId),
    index("returns_seller_id_idx").on(table.sellerId),
  ],
);

export const payouts = pgTable(
  "payouts",
  {
    id,
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id),
    amountPaise: integer("amount_paise").notNull(),
    status: payoutStatusEnum("status").notNull().default("PENDING"),
    paymentId: uuid("payment_id").references(() => payments.id),
    ...timestamps,
  },
  (table) => [index("payouts_seller_id_idx").on(table.sellerId)],
);
