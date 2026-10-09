import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { PortalIcons, PortalPageHeader, type PortalIconName } from "@azadimart/ui";
import { LOW_STOCK_UNITS, loadSellerAttention } from "../lib/seller-attention";

export const metadata = { title: "Notices" };
export const dynamic = "force-dynamic";

type Notice = { icon: PortalIconName; tone: string; title: string; text: string; href: string; action: string; urgent?: boolean };

/** Everything that needs the seller's attention, most urgent first. */
export default async function NoticesPage() {
  const cookie = (await headers()).get("cookie");
  const db = createDatabase();
  const principal = await getSessionPrincipal(new Request("http://azadimart.internal", { headers: cookie ? { cookie } : undefined }), db);
  if (!principal?.sellerId) redirect("/login");
  const a = await loadSellerAttention(db, principal.sellerId);
  if (!a) redirect("/login");

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const notices: Notice[] = [];
  if (a.toShip) notices.push({ icon: "orders", tone: "bg-orange-50 text-orange-600", title: `${plural(a.toShip, "order is", "orders are")} waiting to be shipped`, text: "Pack them and create the shipment so customers get their orders on time.", href: "/orders", action: "Ship now", urgent: true });
  if (a.status !== "ACTIVE") notices.push({ icon: "kyc", tone: "bg-amber-50 text-amber-700", title: a.status === "REJECTED" ? "Your KYC needs changes" : a.status === "KYC_SUBMITTED" || a.status === "PENDING_APPROVAL" ? "Your KYC is under review" : "Complete your KYC to start selling", text: a.status === "KYC_SUBMITTED" || a.status === "PENDING_APPROVAL" ? "We'll let you know once it's approved, usually within 1–2 working days." : "Upload your documents so AzadiMart can verify your business.", href: "/kyc", action: "Open KYC", urgent: a.status !== "KYC_SUBMITTED" && a.status !== "PENDING_APPROVAL" });
  if (a.needsWork) notices.push({ icon: "products", tone: "bg-rose-50 text-rose-600", title: `${plural(a.needsWork, "product needs", "products need")} changes after QC`, text: "Read the reviewer's notes, fix the listing and submit it again.", href: "/products", action: "Fix products", urgent: true });
  if (a.lowStock) notices.push({ icon: "inventory", tone: "bg-violet-50 text-violet-600", title: `${plural(a.lowStock, "item is", "items are")} running low`, text: `${LOW_STOCK_UNITS} or fewer units left. Restock so you don't miss orders.`, href: "/inventory", action: "Update stock" });
  if (a.newReviews) notices.push({ icon: "star", tone: "bg-amber-50 text-amber-600", title: `${plural(a.newReviews, "new review", "new reviews")} to reply to`, text: "A quick, polite reply builds trust with future buyers.", href: "/reviews", action: "Reply" });
  if (a.inReview) notices.push({ icon: "qc", tone: "bg-sky-50 text-sky-600", title: `${plural(a.inReview, "product is", "products are")} in QC review`, text: "No action needed. They go live once approved.", href: "/products", action: "View" });

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Seller Hub" title="Notices" description="Things that need your attention, most important first." />
      <div className="mt-6 max-w-3xl space-y-3">
        {notices.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-card">
            <p className="text-3xl" aria-hidden="true">🎉</p>
            <p className="mt-2 font-semibold">You&apos;re all caught up</p>
            <p className="mt-1 text-sm text-slate-500">No orders to ship and nothing needs fixing right now.</p>
          </div>
        ) : notices.map((n) => {
          const Icon = PortalIcons[n.icon];
          return (
            <div key={n.title} className={"flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-card sm:flex-row sm:items-center " + (n.urgent ? "border-brand/30" : "border-slate-200/80")}>
              <span className={"grid h-11 w-11 shrink-0 place-items-center rounded-xl " + n.tone}><Icon size={22} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">{n.title}{n.urgent ? <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Action needed</span> : null}</p>
                <p className="mt-0.5 text-sm text-slate-500">{n.text}</p>
              </div>
              <Link href={n.href} className={"shrink-0 rounded-full px-4 py-2 text-sm font-semibold " + (n.urgent ? "bg-brand text-white hover:bg-brand-600" : "ring-1 ring-slate-300 hover:ring-slate-900")}>{n.action}</Link>
            </div>
          );
        })}
      </div>
    </main>
  );
}
