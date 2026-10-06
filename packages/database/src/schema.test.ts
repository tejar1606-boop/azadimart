import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  auditLogs,
  inventoryMovements,
  paymentEvents,
  payoutItems,
  qcIssues,
  roles,
  sessions,
  sellerSettings,
  supportMessages,
  userRoles,
  wishlistItems,
  serviceability,
  navigationItems,
  banners,
  cartItems,
  carts,
  categories,
  customerAddresses,
  roles,
  user_roles: userRoles,
  sessions,
  customers,
  deliveryProviders,
  inventory,
  inventory_movements: inventoryMovements,
  MARKETPLACE_TABLES,
  mediaAssets,
  navigation,
  navigation_items: navigationItems,
  orderItems,
  orders,
  pageSections,
  pages,
  payments,
  payment_events: paymentEvents,
  payouts,
  payout_items: payoutItems,
  productAplusContent,
  productMedia,
  productVariants,
  products,
  qcSubmissions,
  refunds,
  returns,
  sellerBankAccounts,
  sellerDocuments,
  sellers,
  sellerVerifications,
  shipmentEvents,
  shipments,
  supportTickets,
  themeRevisions,
  themes,
  wishlists,
  wishlist_items: wishlistItems,
} from "./schema/index";
import { TENANT_SCOPED_TABLES } from "./ownership";

const tables = {
  customers,
  customer_addresses: customerAddresses,
  sellers,
  seller_documents: sellerDocuments,
  seller_bank_accounts: sellerBankAccounts,
  seller_verifications: sellerVerifications,
  seller_settings: sellerSettings,
  categories,
  products,
  product_variants: productVariants,
  product_media: productMedia,
  product_aplus_content: productAplusContent,
  inventory,
  wishlists,
  carts,
  cart_items: cartItems,
  orders,
  order_items: orderItems,
  payments,
  refunds,
  shipments,
  shipment_events: shipmentEvents,
  delivery_providers: deliveryProviders,
  serviceability,
  qc_submissions: qcSubmissions,
  qc_issues: qcIssues,
  returns,
  payouts,
  support_tickets: supportTickets,
  support_messages: supportMessages,
  banners,
  pages,
  page_sections: pageSections,
  themes,
  theme_revisions: themeRevisions,
  navigation,
  media_assets: mediaAssets,
  audit_logs: auditLogs,
};

describe("marketplace schema", () => {
  it("defines every required marketplace table", () => {
    for (const name of MARKETPLACE_TABLES) {
      if (name === "users") {
        continue;
      }
      expect(tables).toHaveProperty(name);
      const table = tables[name as keyof typeof tables];
      expect(getTableName(table)).toBe(name);
    }
  });

  it("keeps seller-owned tables listed for tenant isolation", () => {
    expect(TENANT_SCOPED_TABLES).toContain("products");
    expect(TENANT_SCOPED_TABLES).toContain("inventory");
  });
});
