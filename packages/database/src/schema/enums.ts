import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["CUSTOMER", "SELLER", "ADMIN", "SUPER_ADMIN"]);

export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "DISABLED", "PENDING"]);

export const sellerTaxIdentityTypeEnum = pgEnum("seller_tax_identity_type", ["GSTIN", "ENROLMENT_ID"]);

export const sellerStatusEnum = pgEnum("seller_status", [
  "REGISTERED",
  "KYC_PENDING",
  "KYC_SUBMITTED",
  "PENDING_APPROVAL",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "PENDING",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "GST",
  "GST_ENROLMENT",
  "PAN",
  "BANK_PROOF",
  "ADDRESS_PROOF",
  "IDENTITY",
]);

export const productStatusEnum = pgEnum("product_status", [
  "DRAFT",
  "PENDING_QC",
  "QC_REJECTED",
  "PENDING_ADMIN_APPROVAL",
  "LIVE",
  "UNLISTED",
  "ARCHIVED",
]);

export const mediaKindEnum = pgEnum("media_kind", ["IMAGE", "VIDEO", "DOCUMENT"]);

export const orderStatusEnum = pgEnum("order_status", [
  "CREATED",
  "PAYMENT_PENDING",
  "PAID",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["RAZORPAY", "CASHFREE", "COD"]);

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "PENDING",
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED",
  "CANCELLED",
]);

export const returnStatusEnum = pgEnum("return_status", [
  "REQUESTED",
  "APPROVED",
  "PICKUP_SCHEDULED",
  "RECEIVED",
  "REFUNDED",
  "REJECTED",
]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "PENDING",
  "PROCESSING",
  "PAID",
  "FAILED",
  "ON_HOLD",
]);

export const ticketStatusEnum = pgEnum("ticket_status", ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]);

export const pageStatusEnum = pgEnum("page_status", ["DRAFT", "PUBLISHED"]);

export const themeStatusEnum = pgEnum("theme_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);
