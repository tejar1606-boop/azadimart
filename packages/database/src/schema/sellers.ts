import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { documentTypeEnum, sellerStatusEnum, sellerTaxIdentityTypeEnum, verificationStatusEnum } from "./enums";
import { users } from "./identity";
import { mediaAssets } from "./cms";

export const sellers = pgTable(
  "sellers",
  {
    id,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    storeName: text("store_name").notNull(),
    legalName: text("legal_name").notNull(),
    taxIdentityType: sellerTaxIdentityTypeEnum("tax_identity_type").notNull().default("GSTIN"),
    gstin: text("gstin"),
    gstEnrolmentId: text("gst_enrolment_id"),
    businessState: text("business_state"),
    pan: text("pan"),
    status: sellerStatusEnum("status").notNull().default("REGISTERED"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sellers_user_id_unique").on(table.userId),
    index("sellers_status_idx").on(table.status),
    uniqueIndex("sellers_gst_enrolment_id_unique").on(table.gstEnrolmentId),
  ],
);

export const sellerDocuments = pgTable(
  "seller_documents",
  {
    id,
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    type: documentTypeEnum("type").notNull(),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    ...timestamps,
  },
  (table) => [index("seller_documents_seller_id_idx").on(table.sellerId)],
);

export const sellerBankAccounts = pgTable(
  "seller_bank_accounts",
  {
    id,
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    accountHolderName: text("account_holder_name").notNull(),
    accountNumberLast4: text("account_number_last4").notNull(),
    accountNumberEncrypted: text("account_number_encrypted").notNull(),
    ifsc: text("ifsc").notNull(),
    isPrimary: boolean("is_primary").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("seller_bank_accounts_seller_id_idx").on(table.sellerId)],
);

export const sellerSettings = pgTable("seller_settings", {
  sellerId: uuid("seller_id").primaryKey().references(() => sellers.id, { onDelete: "cascade" }),
  notificationSettings: jsonb("notification_settings").$type<Record<string, unknown>>().notNull().default({}),
  returnSettings: jsonb("return_settings").$type<Record<string, unknown>>().notNull().default({}),
  shippingSettings: jsonb("shipping_settings").$type<Record<string, unknown>>().notNull().default({}),
  businessSettings: jsonb("business_settings").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

export const sellerVerifications = pgTable(
  "seller_verifications",
  {
    id,
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    status: verificationStatusEnum("status").notNull().default("PENDING"),
    notes: text("notes"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [index("seller_verifications_seller_id_idx").on(table.sellerId)],
);
