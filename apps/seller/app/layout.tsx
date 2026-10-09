import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { headers } from "next/headers";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { loadSellerAttention } from "./lib/seller-attention";
import "@azadimart/ui/globals.css";
import SellerChrome, { type SellerCounts } from "./seller-nav";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "AzadiMart Seller Centre", template: "%s · AzadiMart Seller Centre" },
  description: "Sell on AzadiMart",
};

/** Store name, status and attention counts for the signed-in seller's sidebar. */
async function sellerCounts(): Promise<SellerCounts> {
  try {
    const cookie = (await headers()).get("cookie");
    if (!cookie) return null;
    const db = createDatabase();
    const principal = await getSessionPrincipal(new Request("http://azadimart.internal", { headers: { cookie } }), db);
    if (!principal?.sellerId) return null;
    return await loadSellerAttention(db, principal.sellerId);
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
