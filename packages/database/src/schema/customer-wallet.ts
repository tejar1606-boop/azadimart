import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps } from "./columns";
import { customers, users } from "./identity";
import { orders } from "./commerce";

/**
 * Shopper wallet (LOIMART money, e.g. the ₹101 welcome bonus). A ledger: credits
 * keep what's left of them (`remainingPaise`) and when they expire; spending
 * takes from the credits that expire first and remembers which (`allocations`),
 * so a cancelled order puts the money back where it came from.
 */
export const customerWalletEntries = pgTable(
  "customer_wallet_entries",
  {
    id,
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"SIGNUP_BONUS" | "ORDER_SPEND" | "ORDER_REFUND" | "ADJUSTMENT">().notNull(),
    /** + money in, − money out. */
    amountPaise: integer("amount_paise").notNull(),
    remainingPaise: integer("remaining_paise").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    allocations: jsonb("allocations").$type<Array<{ entryId: string; amountPaise: number }>>().notNull().default([]),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("customer_wallet_entries_customer_idx").on(table.customerId, table.createdAt),
    uniqueIndex("customer_wallet_spend_order_unique").on(table.orderId, table.kind).where(sql`${table.kind} in ('ORDER_SPEND', 'ORDER_REFUND')`),
  ],
);

/**
 * Every attempt to get the welcome bonus: GRANTED once per verified mobile,
 * per device and per shopper; BLOCKED attempts keep the reason (same mobile,
 * same device, too many sign-ups from one connection) for Admin to review.
 */
export const signupBonusClaims = pgTable(
  "signup_bonus_claims",
  {
    id,
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    deviceId: text("device_id"),
    fingerprint: text("fingerprint"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    status: text("status").$type<"GRANTED" | "BLOCKED">().notNull(),
    reason: text("reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("signup_bonus_phone_granted_unique").on(table.phone).where(sql`${table.status} = 'GRANTED'`),
    uniqueIndex("signup_bonus_customer_granted_unique").on(table.customerId).where(sql`${table.status} = 'GRANTED'`),
    index("signup_bonus_device_idx").on(table.deviceId),
    index("signup_bonus_fingerprint_idx").on(table.fingerprint),
    index("signup_bonus_ip_idx").on(table.ipAddress, table.createdAt),
  ],
);
