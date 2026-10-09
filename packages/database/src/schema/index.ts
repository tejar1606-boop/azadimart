// AzadiMart database schema source of truth.
export * from "./enums";
export * from "./identity";
export * from "./sellers";
export * from "./catalog";
export * from "./commerce";
export * from "./discounts";
export * from "./fulfillment";
export * from "./cms";
export * from "./support";
export * from "./audit";
export * from "./reviews";

export const MARKETPLACE_TABLES = [
  "users","roles","user_roles","sessions","customers","customer_addresses","sellers","seller_documents",
  "seller_bank_accounts","seller_verifications","seller_settings","categories","brands","products",
  "product_attributes","product_variants","product_media","product_aplus_content","inventory",
  "inventory_movements","wishlists","wishlist_items","carts","cart_items","orders","order_items",
  "payments","payment_events","refunds","shipments","shipment_events","delivery_providers","serviceability",
  "qc_submissions","qc_issues","returns","return_items","payouts","payout_items","support_tickets",
  "support_messages","banners","pages","page_sections","themes","theme_revisions","navigation",
  "navigation_items","media_assets","coupons","coupon_redemptions","audit_logs","login_attempts","rate_limit_buckets",
  "product_reviews","product_review_media","offer_tags",
] as const;