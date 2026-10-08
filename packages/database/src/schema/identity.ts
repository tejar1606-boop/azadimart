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

export const roles = pgTable("roles", {
  id,
  name: text("name").notNull(),
  description: text("description"),
  ...timestamps,
}, (table) => [uniqueIndex("roles_name_unique").on(table.name)]);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("user_roles_user_role_unique").on(table.userId, table.roleId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id,
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

// Every login attempt (success or failure) for brute-force protection and audit.
// Keyed by the submitted email, not user id, so unknown emails are throttled
// the same way as real accounts.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id,
    email: text("email").notNull(),
    ipAddress: text("ip_address").notNull(),
    audience: text("audience").notNull(),
    success: boolean("success").notNull(),
    reason: text("reason"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("login_attempts_email_created_idx").on(table.email, table.createdAt),
    index("login_attempts_ip_created_idx").on(table.ipAddress, table.createdAt),
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
