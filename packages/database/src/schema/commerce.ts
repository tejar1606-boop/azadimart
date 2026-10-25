import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { orderStatusEnum, paymentMethodEnum, paymentStatusEnum, refundStatusEnum, cancelActorEnum } from "./enums";
import { customers, customerAddresses } from "./identity";
import { productVariants, products } from "./catalog";
import { sellers } from "./sellers";

export const wishlists = pgTable(
  "wishlists",
  {
    id,
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Default"),
    ...timestamps,
  },
  // One wishlist per customer; concurrent first loads used to create several.
  (table) => [uniqueIndex("wishlists_customer_id_unique").on(table.customerId)],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    wishlistId: uuid("wishlist_id").notNull().references(() => wishlists.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("wishlist_items_unique").on(table.wishlistId, table.productId)],
);

export const carts = pgTable(
  "carts",
  {
    id,
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    // Abandoned-cart recovery: when the last reminder was sent and how many in total.
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    reminderCount: integer("reminder_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("carts_customer_id_unique").on(table.customerId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id,
    cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id),
    quantity: integer("quantity").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("cart_items_cart_variant_unique").on(table.cartId, table.variantId),
    index("cart_items_cart_id_idx").on(table.cartId),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id,
    orderNumber: text("order_number").notNull(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    shippingAddressId: uuid("shipping_address_id").references(() => customerAddresses.id),
    status: orderStatusEnum("status").notNull().default("CREATED"),
    subtotalPaise: integer("subtotal_paise").notNull().default(0),
    discountPaise: integer("discount_paise").notNull().default(0),
    /** LOIMART wallet money used on this order (paid by LOIMART, like its own coupon). */
    walletPaise: integer("wallet_paise").notNull().default(0),
    shippingPaise: integer("shipping_paise").notNull().default(0),
    /** Platform fee charged to the shopper once per order (kept by LOIMART, not paid to sellers). */
    platformFeePaise: integer("platform_fee_paise").notNull().default(0),
    /** Cashback promised at checkout: added to the shopper's wallet once the order is delivered and kept (paid by the sellers). */
    cashbackPaise: integer("cashback_paise").notNull().default(0),
    grandTotalPaise: integer("grand_total_paise").notNull(),
    couponCode: text("coupon_code"),
    shippingAddressSnapshot: jsonb("shipping_address_snapshot").$type<{
      name?: string;
      phone?: string | null;
      line1: string;
      line2?: string | null;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    }>().notNull().default({ line1: "", city: "", state: "", postalCode: "", country: "IN" }),
    currency: text("currency").notNull().default("INR"),
    /** Set when every seller's shipment is delivered; starts the return window. */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    // Fulfilment deadline (Amazon/Flipkart "ship by"): set at checkout; late orders are reminded, then auto-cancelled.
    shipByAt: timestamp("ship_by_at", { withTimezone: true }),
    packedAt: timestamp("packed_at", { withTimezone: true }),
    // Who cancelled, why and when (customer, seller, admin, or SYSTEM for auto-cancel).
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: cancelActorEnum("cancelled_by"),
    cancellationReason: text("cancellation_reason"),
    // A seller's request to cancel an order shared with other sellers (admin decides).
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelRequestedBySellerId: uuid("cancel_requested_by_seller_id"),
    cancelRequestReason: text("cancel_request_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("orders_order_number_unique").on(table.orderNumber),
    index("orders_ship_by_idx").on(table.shipByAt),
    index("orders_customer_id_idx").on(table.customerId),
    index("orders_status_idx").on(table.status),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id,
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id),
    title: text("title").notNull(),
    sku: text("sku").notNull(),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    /** Coupon discount on this line paid by the seller (taken from their payout). */
    sellerDiscountPaise: integer("seller_discount_paise").notNull().default(0),
    /** This line's share of the order's cashback, paid by the seller (from their payout, only if the shopper gets it). */
    cashbackPaise: integer("cashback_paise").notNull().default(0),
    /** GST at the time of the order (for the invoice): HSN code and rate in basis points. */
    hsnCode: text("hsn_code"),
    gstRateBps: integer("gst_rate_bps"),
    ...timestamps,
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_seller_id_idx").on(table.sellerId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id,
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    provider: paymentMethodEnum("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    ...timestamps,
  },
  (table) => [
    index("payments_order_id_idx").on(table.orderId),
    uniqueIndex("payments_provider_payment_unique").on(table.provider, table.providerPaymentId),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id,
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("payment_events_provider_event_unique").on(table.provider, table.eventId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id,
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    amountPaise: integer("amount_paise").notNull(),
    status: refundStatusEnum("status").notNull().default("PENDING"),
    idempotencyKey: text("idempotency_key").notNull(),
    reason: text("reason"),
    providerRefundId: text("provider_refund_id"),
    ...timestamps,
  },
  (table) => [
    index("refunds_order_id_idx").on(table.orderId),
    uniqueIndex("refunds_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("refunds_provider_refund_unique").on(table.providerRefundId),
  ],
);

/** What an invoice shows, frozen when it is issued (later edits to sellers or products don't change it). */
export type InvoiceDetails = {
  seller: { legalName: string; storeName: string; gstin: string | null; gstEnrolmentId: string | null; pan: string | null; address: string; state: string; stateCode: string | null };
  buyer: { name: string; phone: string | null; address: string; state: string; stateCode: string | null };
  marketplace: { name: string; legalName: string; gstin: string | null; address: string };
  orderNumber: string;
  orderDate: string;
  placeOfSupply: string;
  interState: boolean;
  paymentMethod: string;
  lines: Array<{ orderItemId?: string; title: string; sku: string; hsnCode: string | null; gstRateBps: number; quantity: number; unitPricePaise: number; grossPaise: number; discountPaise: number; netPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }>;
  /** Part of the customer's coupon paid by LOIMART (not a seller discount; doesn't lower the taxable value). */
  platformDiscountPaise: number;
  /** Credit notes: the invoice it reverses and why. */
  original?: { number: string; issuedAt: string };
  reason?: string;
};

/**
 * Tax invoices (seller → customer, issued by LOIMART for the seller when the
 * parcel ships), bills of supply (sellers without GST registration) and
 * credit notes (returns and undelivered parcels). Numbered per seller per
 * financial year; never edited or deleted once issued.
 */
export const invoices = pgTable(
  "invoices",
  {
    id,
    kind: text("kind").$type<"TAX_INVOICE" | "BILL_OF_SUPPLY" | "CREDIT_NOTE">().notNull(),
    number: text("number").notNull(),
    financialYear: text("financial_year").notNull(),
    sequence: integer("sequence").notNull(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id, { onDelete: "restrict" }),
    /** Credit notes: the invoice they reverse. */
    originalInvoiceId: uuid("original_invoice_id"),
    /** What caused it, so it is issued once: "ORDER:<order>:<seller>", "RTO:<shipment>", "RETURN:<return>". */
    sourceKey: text("source_key").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    taxablePaise: integer("taxable_paise").notNull(),
    cgstPaise: integer("cgst_paise").notNull().default(0),
    sgstPaise: integer("sgst_paise").notNull().default(0),
    igstPaise: integer("igst_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    /** Issued on a test server or before LOIMART's GST details were set: marked "TEST" and not valid. */
    isTest: boolean("is_test").notNull().default(false),
    details: jsonb("details").$type<InvoiceDetails>().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("invoices_seller_number_unique").on(table.sellerId, table.number),
    uniqueIndex("invoices_source_key_unique").on(table.sourceKey),
    index("invoices_order_id_idx").on(table.orderId),
    index("invoices_issued_at_idx").on(table.issuedAt),
  ],
);

/** The last number used in each seller's invoice series (per kind, per financial year). */
export const invoiceCounters = pgTable(
  "invoice_counters",
  {
    sellerId: uuid("seller_id").notNull().references(() => sellers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    financialYear: text("financial_year").notNull(),
    lastSequence: integer("last_sequence").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.sellerId, table.kind, table.financialYear] })],
);
