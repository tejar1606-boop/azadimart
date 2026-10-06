import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  auditLogs,
  banners,
  cartItems,
  carts,
  categories,
  customerAddresses,
  customers,
  deliveryProviders,
  inventory,
  inventoryMovements,
  MARKETPLACE_TABLES,
  mediaAssets,
  navigation,
  navigationItems,
  orderItems,
  orders,
  pageSections,
  pages,
  paymentEvents,
  payments,
  payouts,
  payoutItems,
  productAplusContent,
  productMedia,
  productVariants,
  products,
  qcIssues,
  qcSubmissions,
  refunds,
  returns,
  roles,
  sellerBankAccounts,
  sellerDocuments,
  sellerSettings,
  sellers,
  sellerVerifications,
  serviceability,
  sessions,
  shipmentEvents,
  shipments,
  supportMessages,
  supportTickets,
  themeRevisions,
  themes,
  userRoles,
  users,
  wishlists,
  wishlistItems,
} from "./schema/index";
import { TENANT_SCOPED_TABLES } from "./ownership";

const tables = {
  users,
  roles,
  user_roles: userRoles,
  sessions,
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
  inventory_movements: inventoryMovements,
  wishlists,
  wishlist_items: wishlistItems,
  carts,
  cart_items: cartItems,
  orders,
  order_items: orderItems,
  payments,
  payment_events: paymentEvents,
  refunds,
  shipments,
  shipment_events: shipmentEvents,
  delivery_providers: deliveryProviders,
  serviceability,
  qc_submissions: qcSubmissions,
  qc_issues: qcIssues,
  returns,
  payouts,
  payout_items: payoutItems,
  support_tickets: supportTickets,
  support_messages: supportMessages,
  banners,
  pages,
  page_sections: pageSections,
  themes,
  theme_revisions: themeRevisions,
  navigation,
  navigation_items: navigationItems,
  media_assets: mediaAssets,
  audit_logs: auditLogs,
};

describe("marketplace schema", () => {
  it("defines every required marketplace table", () => {
    for (const name of MARKETPLACE_TABLES) {
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
