import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    taxDeclarationAcceptedAt: timestamp("tax_declaration_accepted_at", { withTimezone: true }),
    pan: text("pan"),
    status: sellerStatusEnum("status").notNull().default("REGISTERED"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    // Set by an admin to stop automatic payouts to this seller (e.g. a dispute).
    payoutHoldReason: text("payout_hold_reason"),
    // Most a seller may owe in ads beyond their upcoming earnings (null = AzadiMart's default).
    adCreditLimitPaise: integer("ad_credit_limit_paise"),
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
    // Payouts go only to a verified primary account; a new account pauses payouts until verified.
    verificationStatus: text("verification_status").$type<"PENDING" | "VERIFIED" | "REJECTED">().notNull().default("PENDING"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id),
    rejectionReason: text("rejection_reason"),
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

/**
 * In-app alerts for sellers (new orders, ship-by reminders, cancellations).
 * Shown in Notices and as live pop-ups; also sent as browser push when the
 * seller has turned it on.
 */
export const sellerNotifications = pgTable(
  "seller_notifications",
  {
    id,
    sellerId: uuid("seller_id").notNull().references(() => sellers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    // One alert per kind per order (e.g. NEW_ORDER:<orderId>), so retries never duplicate.
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("seller_notifications_seller_created_idx").on(table.sellerId, table.createdAt),
    uniqueIndex("seller_notifications_dedupe_unique").on(table.sellerId, table.dedupeKey),
  ],
);

/** Browser push subscriptions (Web Push) for a seller's devices. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id,
    sellerId: uuid("seller_id").notNull().references(() => sellers.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint), index("push_subscriptions_seller_idx").on(table.sellerId)],
);

/**
 * Owner's Aadhaar check by OTP (mandatory before KYC). Aadhaar rules forbid
 * storing the number itself, so only the last 4 digits, the details the
 * licensed provider returns, the consent time and the provider's reference
 * are kept.
 */
export const sellerAadhaar = pgTable("seller_aadhaar", {
  sellerId: uuid("seller_id").primaryKey().references(() => sellers.id, { onDelete: "cascade" }),
  status: text("status").$type<"OTP_SENT" | "VERIFIED">().notNull(),
  last4: text("last4").notNull(),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  nameOnAadhaar: text("name_on_aadhaar"),
  yearOfBirth: text("year_of_birth"),
  stateOnAadhaar: text("state_on_aadhaar"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  ...timestamps,
});
