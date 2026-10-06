export * from "./enums";
export * from "./identity";
export * from "./sellers";
export * from "./catalog";
export * from "./commerce";
export * from "./fulfillment";
export * from "./cms";
export * from "./support";
export * from "./audit";

export const MARKETPLACE_TABLES = [
  "users",
  "customers",
  "customer_addresses",
  "sellers",
  "seller_documents",
  "seller_bank_accounts",
  "seller_verifications",
  "categories",
  "products",
  "product_variants",
  "product_media",
  "product_aplus_content",
  "inventory",
  "wishlists",
  "carts",
  "cart_items",
  "orders",
  "order_items",
  "payments",
  "refunds",
  "shipments",
  "shipment_events",
  "delivery_providers",
  "qc_submissions",
  "returns",
  "payouts",
  "support_tickets",
  "banners",
  "pages",
  "page_sections",
  "themes",
  "theme_revisions",
  "navigation",
  "media_assets",
  "audit_logs",
] as const;
