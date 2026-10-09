import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { payoutStatusEnum, returnStatusEnum, shipmentStatusEnum } from "./enums";
import { orders, orderItems, payments } from "./commerce";
import { sellerBankAccounts, sellers } from "./sellers";
import { users } from "./identity";

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
    uniqueIndex("shipments_order_seller_unique").on(table.orderId, table.sellerId),
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

export const serviceability = pgTable(
  "serviceability",
  {
    id,
    deliveryProviderId: uuid("delivery_provider_id")
      .notNull()
      .references(() => deliveryProviders.id, { onDelete: "cascade" }),
    postalCode: text("postal_code").notNull(),
    serviceType: text("service_type").notNull(),
    codAvailable: boolean("cod_available").notNull().default(false),
    estimatedDays: integer("estimated_days"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("serviceability_provider_postal_service_unique").on(
      table.deliveryProviderId,
      table.postalCode,
      table.serviceType,
    ),
    index("serviceability_postal_code_idx").on(table.postalCode),
  ],
);

export const payoutItems = pgTable(
  "payout_items",
  {
    id,
    payoutId: uuid("payout_id").notNull().references(() => payouts.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id, { onDelete: "restrict" }),
    grossAmountPaise: integer("gross_amount_paise").notNull(),
    deductionsPaise: integer("deductions_paise").notNull().default(0),
    netAmountPaise: integer("net_amount_paise").notNull(),
    // Breakdown of the deductions, fixed when the item is paid out.
    quantity: integer("quantity").notNull().default(0),
    commissionRateBps: integer("commission_rate_bps").notNull().default(0),
    commissionPaise: integer("commission_paise").notNull().default(0),
    gstOnCommissionPaise: integer("gst_on_commission_paise").notNull().default(0),
    tcsPaise: integer("tcs_paise").notNull().default(0),
    tdsPaise: integer("tds_paise").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("payout_items_payout_id_idx").on(table.payoutId),
    // An order item is paid out at most once.
    uniqueIndex("payout_items_order_item_id_unique").on(table.orderItemId),
  ],
);

export const returns = pgTable(
  "returns",
  {
    id,
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
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

export const returnItems = pgTable(
  "return_items",
  {
    id,
    returnId: uuid("return_id")
      .notNull()
      .references(() => returns.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    reason: text("reason"),
    receivedCondition: text("received_condition"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("return_items_return_order_item_unique").on(table.returnId, table.orderItemId),
    index("return_items_order_item_id_idx").on(table.orderItemId),
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
    grossPaise: integer("gross_paise").notNull().default(0),
    deductionsPaise: integer("deductions_paise").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    bankAccountId: uuid("bank_account_id").references(() => sellerBankAccounts.id),
    // Idempotency key sent to the bank/payout service, so a retry never pays twice.
    reference: text("reference"),
    mode: text("mode").$type<"TEST" | "LIVE">().notNull().default("TEST"),
    utr: text("utr"),
    providerRef: text("provider_ref"),
    attempts: integer("attempts").notNull().default(0),
    failureReason: text("failure_reason"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("payouts_seller_id_idx").on(table.sellerId),
    index("payouts_status_idx").on(table.status),
    uniqueIndex("payouts_reference_unique").on(table.reference),
  ],
);
