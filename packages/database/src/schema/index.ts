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
  "roles",
  "user_roles",
  "sessions",
  "customers",
  "customer_addresses",
  "sellers",
  "seller_documents",
  "seller_bank_accounts",
  "seller_verifications",
  "seller_settings",
  "categories",
  "products",
  "product_variants",
  "product_media",
  "product_aplus_content",
  "inventory",
  "inventory_movements",
  "wishlists",
  "wishlist_items",
  "carts",
  "cart_items",
  "orders",
  "order_items",
  "payments",
  "payment_events",
  "refunds",
  "shipments",
  "shipment_events",
  "delivery_providers",
  "serviceability",
  "qc_submissions",
  "qc_issues",
  "returns",
  "payouts",
  "payout_items",
  "support_tickets",
  "support_messages",
  "banners",
  "pages",
  "page_sections",
  "themes",
  "theme_revisions",
  "navigation",
  "navigation_items",
  "media_assets",
  "audit_logs",
] as const;
