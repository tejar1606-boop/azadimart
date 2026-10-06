import { index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { orderStatusEnum, paymentMethodEnum, paymentStatusEnum } from "./enums";
import { customers, customerAddresses } from "./identity";
import { productVariants, products } from "./catalog";
import { sellers } from "./sellers";

export const wishlists = pgTable(
  "wishlists",
  {
    id,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Default"),
    ...timestamps,
  },
  (table) => [index("wishlists_customer_id_idx").on(table.customerId)],
);

export const carts = pgTable(
  "carts",
  {
    id,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("carts_customer_id_unique").on(table.customerId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id,
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
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
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    shippingAddressId: uuid("shipping_address_id").references(() => customerAddresses.id),
    status: orderStatusEnum("status").notNull().default("CREATED"),
    grandTotalPaise: integer("grand_total_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("orders_order_number_unique").on(table.orderNumber),
    index("orders_customer_id_idx").on(table.customerId),
    index("orders_status_idx").on(table.status),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id,
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    title: text("title").notNull(),
    sku: text("sku").notNull(),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
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
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: paymentMethodEnum("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    ...timestamps,
  },
  (table) => [index("payments_order_id_idx").on(table.orderId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id,
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    amountPaise: integer("amount_paise").notNull(),
    reason: text("reason"),
    providerRefundId: text("provider_refund_id"),
    ...timestamps,
  },
  (table) => [index("refunds_order_id_idx").on(table.orderId)],
);
