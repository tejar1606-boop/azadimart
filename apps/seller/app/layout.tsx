import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { headers } from "next/headers";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, orderItems, orders, products, shipments } from "@azadimart/database";
import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import "@azadimart/ui/globals.css";
import SellerChrome, { type SellerCounts } from "./seller-nav";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "AzadiMart Seller Centre", template: "%s · AzadiMart Seller Centre" },
  description: "Sell on AzadiMart",
};

/** Sidebar counts for a signed-in seller (orders to ship, products needing work). */
async function sellerCounts(): Promise<SellerCounts> {
  try {
    const cookie = (await headers()).get("cookie");
    if (!cookie) return null;
    const db = createDatabase();
    const principal = await getSessionPrincipal(new Request("http://azadimart.internal", { headers: { cookie } }), db);
    if (!principal?.sellerId) return null;
    const open = await db.selectDistinct({ id: orders.id }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.sellerId, principal.sellerId), inArray(orders.status, ["CONFIRMED", "PACKED"])));
    const shipped = open.length ? await db.select({ orderId: shipments.orderId }).from(shipments)
      .where(and(eq(shipments.sellerId, principal.sellerId), inArray(shipments.orderId, open.map((o) => o.id)), notInArray(shipments.status, ["FAILED", "CANCELLED"]))) : [];
    const needsWork = await db.select({ n: count() }).from(products).where(and(eq(products.sellerId, principal.sellerId), eq(products.status, "QC_REJECTED")));
    return { toShip: open.length - new Set(shipped.map((s) => s.orderId)).size, needsWork: Number(needsWork[0]?.n ?? 0) };
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const counts = await sellerCounts();
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen bg-panel font-sans text-slate-950 antialiased">
        <SellerChrome counts={counts}>{children}</SellerChrome>
      </body>
    </html>
  );
}
