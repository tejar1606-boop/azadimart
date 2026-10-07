import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { customers } from "./identity";
import { orders } from "./commerce";
import { sellers } from "./sellers";

export const couponDiscountTypeEnum = pgEnum("coupon_discount_type", [
  "PERCENTAGE",
  "FIXED",
  "FREE_SHIPPING",
]);

export const couponFundingTypeEnum = pgEnum("coupon_funding_type", [
  "AZADIMART",
  "SELLER",
]);

export const coupons = pgTable(
  "coupons",
  {
    id,
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    discountType: couponDiscountTypeEnum("discount_type").notNull(),
    discountValue: integer("discount_value").notNull().default(0),
    minimumOrderPaise: integer("minimum_order_paise").notNull().default(0),
    maximumDiscountPaise: integer("maximum_discount_paise"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    usageLimit: integer("usage_limit"),
    usageCount: integer("usage_count").notNull().default(0),
    perCustomerLimit: integer("per_customer_limit").notNull().default(1),
    firstOrderOnly: boolean("first_order_only").notNull().default(false),
    stackable: boolean("stackable").notNull().default(false),
    fundingType: couponFundingTypeEnum("funding_type").notNull().default("AZADIMART"),
    sellerId: uuid("seller_id").references(() => sellers.id, { onDelete: "set null" }),
    scope: jsonb("scope").$type<{
      productIds?: string[];
      categoryIds?: string[];
      sellerIds?: string[];
    }>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("coupons_code_unique").on(table.code),
    index("coupons_active_window_idx").on(table.isActive, table.startsAt, table.endsAt),
    index("coupons_seller_id_idx").on(table.sellerId),
  ],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id,
    couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    discountPaise: integer("discount_paise").notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("coupon_redemptions_coupon_order_unique").on(table.couponId, table.orderId),
    index("coupon_redemptions_customer_idx").on(table.customerId),
  ],
);