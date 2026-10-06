import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { userRoleEnum, userStatusEnum } from "./enums";

export const users = pgTable(
  "users",
  {
    id,
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull(),
    status: userStatusEnum("status").notNull().default("PENDING"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_phone_unique").on(table.phone),
    index("users_role_idx").on(table.role),
  ],
);

export const customers = pgTable("customers", {
  id,
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  fullName: text("full_name").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("customers_user_id_unique").on(table.userId)]);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text("label"),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull().default("IN"),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("customer_addresses_customer_id_idx").on(table.customerId)],
);
