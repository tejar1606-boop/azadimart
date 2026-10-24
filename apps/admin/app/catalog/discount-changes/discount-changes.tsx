"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import { discountPct } from "@azadimart/shared";

type Row = {
  id: string; productId: string; productTitle: string; storeName: string; kind: "PRICE" | "COUPON_LIMIT"; sku: string; variantTitle: string;
  pricePaiseBefore: number | null; pricePaiseAfter: number; mrpPaiseBefore: number | null; mrpPaiseAfter: number | null; couponPctBefore: number | null; couponPctAfter: number | null;
  source: string; mrpRaised: boolean; createdAt: string; requestedBy: string | null; approvedBy: string | null;
};
type Data = { days: number; show: string; counts: { all: number; mrp: number; big: number; coupon: number }; items: Row[] };

const rupees = (paise: number | null) => (paise == null ? "—" : "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const off = (price: number | null, mrp: number | null) => (price == null ? "—" : discountPct(price, mrp) ? `${discountPct(price, mrp)}% off` : "No discount");
const coupon = (pct: number | null) => (pct ? `${pct}%` : "none");
const SOURCE: Record<string, string> = { SELLER_EDIT: "Seller (not live yet)", SELLER_EDIT_APPROVED: "Seller · approved in QC", SELLER_COUPON_LIMIT: "Seller · coupon setting", ADMIN_EDIT: "Admin" };

/** Every price, MRP and coupon-limit change across all products, so discounts can be reviewed in one place. */
export default function DiscountChanges() {
  const [days, setDays] = useState(7);
  const [show, setShow] = useState("all");
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => { setData(null); void fetch(`/api/v1/catalog/price-changes?days=${days}&show=${show}`, { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => undefined); }, [days, show]);
  const chip = (active: boolean) => "rounded-full px-3.5 py-1.5 text-xs font-semibold " + (active ? "bg-chrome text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900");
  const c = data?.counts;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Catalogue" title="Discount changes" description="Every change to a product's selling price, MRP or coupon limit, newest first. Price and MRP changes to live products were approved in QC; coupon limits are the seller's own money and apply at once." />
      <div className="mt-5 flex flex-wrap gap-2">
        {[7, 30, 90].map((d) => <button key={d} type="button" onClick={() => setDays(d)} className={chip(days === d)}>Last {d} days</button>)}
        <span className="mx-1 w-px bg-slate-200" />
        {([["all", "All", c?.all], ["mrp", "⚠ MRP raised", c?.mrp], ["big", "70%+ off", c?.big], ["coupon", "Coupon limits", c?.coupon]] as const).map(([v, l, n]) => (
          <button key={v} type="button" onClick={() => setShow(v)} className={chip(show === v)}>{l}{n !== undefined ? ` (${n})` : ""}</button>
        ))}
      </div>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {!data ? <p className="p-6 text-sm text-ink-muted">Loading…</p> : data.items.length === 0 ? <p className="p-6 text-sm text-ink-muted">No changes in this period.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-ink-muted"><th className="px-4 py-2.5">When</th><th className="pr-3">Product</th><th className="pr-3">What changed</th><th className="pr-3">Discount</th><th>Who</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className={"border-t border-slate-100 align-top " + (r.mrpRaised ? "bg-red-50/60" : "")}>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">{new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                    <td className="pr-3"><Link href={`/catalog/${r.productId}`} className="font-semibold hover:underline">{r.productTitle}</Link><span className="block text-xs text-ink-muted">{r.storeName} · {r.kind === "COUPON_LIMIT" ? "all sizes" : `${r.variantTitle} · ${r.sku}`}</span></td>
                    <td className="pr-3">{r.kind === "COUPON_LIMIT"
                      ? <>Coupon limit {coupon(r.couponPctBefore)} → <b>{coupon(r.couponPctAfter)}</b></>
                      : <>MRP {rupees(r.mrpPaiseBefore)} → <b>{rupees(r.mrpPaiseAfter)}</b>{r.mrpRaised ? <span className="ml-1 text-xs font-bold text-red-600">⚠ raised</span> : null}<span className="block">Price {rupees(r.pricePaiseBefore)} → <b>{rupees(r.pricePaiseAfter)}</b></span></>}</td>
                    <td className="pr-3">{r.kind === "COUPON_LIMIT"
                      ? <>Lowest with coupon {rupees(Math.round(r.pricePaiseAfter * (100 - (r.couponPctBefore ?? 0)) / 100))} → <b>{rupees(Math.round(r.pricePaiseAfter * (100 - (r.couponPctAfter ?? 0)) / 100))}</b></>
                      : <>{off(r.pricePaiseBefore, r.mrpPaiseBefore)} → <b>{off(r.pricePaiseAfter, r.mrpPaiseAfter)}</b>{discountPct(r.pricePaiseAfter, r.mrpPaiseAfter) >= 70 ? <span className="ml-1 text-xs font-bold text-amber-700">⚠ 70%+</span> : null}</>}</td>
                    <td className="pr-4 text-xs"><span className="font-semibold">{SOURCE[r.source] ?? r.source}</span>{r.requestedBy ? <span className="block text-ink-muted">Asked: {r.requestedBy}</span> : null}{r.approvedBy && r.source !== "ADMIN_EDIT" ? <span className="block text-ink-muted">Approved: {r.approvedBy}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
