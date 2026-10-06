/**
 * Database ownership: only this package may define schema, migrations, and
 * query helpers. Apps consume typed repositories; they never issue ad-hoc SQL.
 */
export const DATABASE_OWNER = "@azadimart/database";

export const TENANT_SCOPED_TABLES = [
  "products",
  "product_variants",
  "product_media",
  "product_aplus_content",
  "inventory",
  "qc_submissions",
  "order_items",
  "shipments",
  "returns",
  "payouts",
  "seller_documents",
  "seller_bank_accounts",
  "seller_verifications",
] as const;

export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];

export function assertSellerScope(actorSellerId: string, resourceSellerId: string): void {
  if (actorSellerId !== resourceSellerId) {
    throw new Error("TENANT_ISOLATION");
  }
}
