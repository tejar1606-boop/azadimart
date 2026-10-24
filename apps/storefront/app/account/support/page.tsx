import { SupportTicketList } from "@azadimart/ui";
import { SUPPORT_CATEGORIES, supportCategoriesFor } from "@azadimart/shared";
import Link from "next/link";
import { requireCustomerPage } from "./session";

export const metadata = { title: "Help & support", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const startCreating = (await searchParams).new === "1";
  await requireCustomerPage(startCreating ? "/account/support?new=1" : "/account/support");
  return (
    <main className="min-h-[60vh] bg-canvas px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">My account</p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Help &amp; support.</h1>
            <p className="mt-2 text-sm text-slate-500">Your conversations with the LOIMART support team.</p>
          </div>
          <Link href="/account" className="text-sm font-bold text-slate-500">← Your orders</Link>
        </div>
        <div className="mt-7">
          <SupportTicketList startCreating={startCreating} apiBase="/api/v1/support" ticketsPath="/account/support" categories={supportCategoriesFor("CUSTOMER").map((key) => ({ key, label: SUPPORT_CATEGORIES[key].label }))} />
        </div>
      </div>
    </main>
  );
}
