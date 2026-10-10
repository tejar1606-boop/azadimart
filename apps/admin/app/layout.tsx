import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { headers } from "next/headers";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, adCampaigns, productAplusContent, products, qcSubmissions, sellerVerifications } from "@azadimart/database";
import { count, eq } from "drizzle-orm";
import "@azadimart/ui/globals.css";
import AdminChrome, { type AdminCounts } from "./_components/admin-chrome";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "AzadiMart Admin", template: "%s · AzadiMart Admin" },
  description: "Operations and commerce console",
  robots: { index: false, follow: false },
};

/** Work-queue counts for the sidebar; only computed for a signed-in admin. */
async function adminCounts(): Promise<AdminCounts | null> {
  try {
    const cookie = (await headers()).get("cookie");
    if (!cookie) return null;
    const db = createDatabase();
    const principal = await getSessionPrincipal(new Request("http://azadimart.internal", { headers: { cookie } }), db);
    if (!principal || (principal.role !== "ADMIN" && principal.role !== "SUPER_ADMIN")) return null;
    const [sellersPending, qcPending, approvals, aplusPending, adsPending] = await Promise.all([
      db.select({ n: count() }).from(sellerVerifications).where(eq(sellerVerifications.status, "IN_REVIEW")),
      db.select({ n: count() }).from(qcSubmissions).where(eq(qcSubmissions.status, "PENDING")),
      db.select({ n: count() }).from(products).where(eq(products.status, "PENDING_ADMIN_APPROVAL")),
      db.select({ n: count() }).from(productAplusContent).where(eq(productAplusContent.status, "PENDING_REVIEW")),
      db.select({ n: count() }).from(adCampaigns).where(eq(adCampaigns.status, "PENDING_REVIEW")),
    ]);
    return { sellers: Number(sellersPending[0]?.n ?? 0), qc: Number(qcPending[0]?.n ?? 0), approvals: Number(approvals[0]?.n ?? 0), aplus: Number(aplusPending[0]?.n ?? 0), ads: Number(adsPending[0]?.n ?? 0) };
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const counts = await adminCounts();
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen bg-panel font-sans text-slate-950 antialiased">
        <AdminChrome counts={counts}>{children}</AdminChrome>
      </body>
    </html>
  );
}
