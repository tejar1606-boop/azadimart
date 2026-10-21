"use client";

import { useEffect, useState } from "react";
import { discountPct } from "@azadimart/shared";

type Row = {
  id: string; sku: string; variantTitle: string; pricePaiseBefore: number | null; pricePaiseAfter: number; mrpPaiseBefore: number | null; mrpPaiseAfter: number | null;
  source: "SELLER_EDIT" | "SELLER_EDIT_APPROVED" | "ADMIN_EDIT"; mrpRaised: boolean; createdAt: string; requestedBy: string | null; requestedByRole: string | null; approvedBy: string | null;
};
const rupees = (paise: number | null) => (paise == null ? "—" : "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const pct = (price: number | null, mrp: number | null) => (price == null ? "—" : discountPct(price, mrp) ? `${discountPct(price, mrp)}% off` : "No discount");
const SOURCE: Record<Row["source"], string> = { SELLER_EDIT: "Seller (before going live)", SELLER_EDIT_APPROVED: "Seller · approved in QC", ADMIN_EDIT: "Admin edit" };

/** Every change to this product's selling price or MRP: when, who asked, who approved, and the discount before → after. */
export default function PriceHistory({ productId }: { productId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { void fetch(`/api/v1/catalog/products/${productId}/price-history`, { cache: "no-store" }).then((r) => r.json()).then((b) => setRows(b.items ?? [])).catch(() => setRows([])); }, [productId]);
  return (
    <section className="mx-4 mb-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:mx-6 lg:mx-10">
      <h2 className="font-semibold">Price history</h2>
      <p className="mt-0.5 text-xs text-ink-muted">Every change to the selling price or MRP, size by size. Changes to live products only happen after QC approves them.</p>
      {!rows ? <p className="mt-3 text-sm text-ink-muted">Loading…</p> : rows.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No price changes recorded yet.</p> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted"><th className="py-2 pr-3">When</th><th className="pr-3">Size / colour</th><th className="pr-3">MRP</th><th className="pr-3">Selling price</th><th className="pr-3">Discount</th><th>Who</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={"border-t border-slate-100 align-top " + (r.mrpRaised ? "bg-red-50/60" : "")}>
                  <td className="py-2 pr-3 text-xs text-ink-muted">{new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td className="pr-3"><span className="font-medium">{r.variantTitle}</span> <span className="text-xs text-ink-muted">{r.sku}</span></td>
                  <td className="pr-3">{rupees(r.mrpPaiseBefore)} → <b>{rupees(r.mrpPaiseAfter)}</b>{r.mrpRaised ? <span className="ml-1 text-xs font-bold text-red-600">⚠ raised</span> : null}</td>
                  <td className="pr-3">{rupees(r.pricePaiseBefore)} → <b>{rupees(r.pricePaiseAfter)}</b></td>
                  <td className="pr-3">{pct(r.pricePaiseBefore, r.mrpPaiseBefore)} → <b>{pct(r.pricePaiseAfter, r.mrpPaiseAfter)}</b></td>
                  <td className="text-xs"><span className="font-semibold">{SOURCE[r.source]}</span>{r.requestedBy ? <span className="block text-ink-muted">Asked: {r.requestedBy}</span> : null}{r.approvedBy && r.source !== "ADMIN_EDIT" ? <span className="block text-ink-muted">Approved: {r.approvedBy}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
