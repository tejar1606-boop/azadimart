import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { createDatabase, liveChats, adCampaigns, productAplusContent, products, qcSubmissions, sellerVerifications, supportTickets } from "@azadimart/database";
import { and, count, eq, inArray } from "drizzle-orm";
import "@azadimart/ui/globals.css";
import AdminChrome, { type AdminCounts } from "./_components/admin-chrome";
import { currentStaff } from "./lib/staff-page";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "AzadiMart Admin", template: "%s · AzadiMart Admin" },
  description: "Operations and commerce console",
  robots: { index: false, follow: false },
};

/** Work-queue counts for the sidebar, only for the areas the signed-in team member may use. */
async function adminCounts(): Promise<AdminCounts | null> {
  try {
    const db = createDatabase();
    const access = await currentStaff(db);
    if (!access) return null;
    const can = (p: string) => access.permissions.includes(p as never);
    const n = (q: Promise<Array<{ n: number }>>) => q.then((r) => Number(r[0]?.n ?? 0));
    const skip = Promise.resolve(0);
    const [liveWaiting, support, sellersPending, qc, approvals, aplus, ads] = await Promise.all([
      can("livechat") ? n(db.select({ n: count() }).from(liveChats).where(eq(liveChats.status, "WAITING"))) : skip,
      // Tickets where the requester is waiting on the team.
      can("support") ? n(db.select({ n: count() }).from(supportTickets).where(and(inArray(supportTickets.status, ["OPEN", "IN_PROGRESS"]), eq(supportTickets.lastReplyBy, "REQUESTER")))) : skip,
      can("sellers") ? n(db.select({ n: count() }).from(sellerVerifications).where(eq(sellerVerifications.status, "IN_REVIEW"))) : skip,
      can("catalog") ? n(db.select({ n: count() }).from(qcSubmissions).where(eq(qcSubmissions.status, "PENDING"))) : skip,
      can("catalog") ? n(db.select({ n: count() }).from(products).where(eq(products.status, "PENDING_ADMIN_APPROVAL"))) : skip,
      can("catalog") ? n(db.select({ n: count() }).from(productAplusContent).where(eq(productAplusContent.status, "PENDING_REVIEW"))) : skip,
      can("marketing") ? n(db.select({ n: count() }).from(adCampaigns).where(eq(adCampaigns.status, "PENDING_REVIEW"))) : skip,
    ]);
    return { liveWaiting, role: access.role, roleName: access.roleName, displayName: access.displayName, permissions: access.permissions, support, sellers: sellersPending, qc, approvals, aplus, ads };
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
