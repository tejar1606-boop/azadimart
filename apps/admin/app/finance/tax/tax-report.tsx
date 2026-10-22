"use client";

import { useEffect, useMemo, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import { toCsv } from "@azadimart/shared";

type Row = { sellerId: string; legalName: string; storeName: string; gstin: string | null; pan: string | null; state: string | null; suppliesPaise: number; returnsPaise: number; netPaise: number; netTaxablePaise: number; tcsPaise: number; tcsIgstPaise: number; tcsCgstPaise: number; tcsSgstPaise: number; tdsBasePaise: number; tdsPaise: number };
type Report = { month: string; rows: Row[]; totals: { suppliesPaise: number; returnsPaise: number; netTaxablePaise: number; tcsPaise: number; tcsIgstPaise: number; tcsCgstPaise: number; tcsSgstPaise: number; tdsPaise: number } };

const rupees = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amount = (paise: number) => (paise / 100).toFixed(2);
/** The last 12 months (India time), newest first, as "2026-10". */
function months() {
  const ist = new Date(Date.now() + 330 * 60_000);
  return Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - i, 1)); return d.toISOString().slice(0, 7); });
}
const label = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

function download(name: string, rows: Array<Array<string | number | null>>) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

/** Monthly TCS (for LOIMART's GSTR-8, due by the 10th) and TDS 194-O (deposit by the 7th, quarterly Form 26Q / 16A). */
export default function TaxReport() {
  const list = useMemo(months, []);
  const [month, setMonth] = useState(list[1] ?? list[0]!);
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => { setReport(null); void fetch(`/api/v1/finance/tax-report?month=${month}`, { cache: "no-store" }).then((r) => r.json()).then(setReport).catch(() => undefined); }, [month]);
  const gst = (report?.rows ?? []).filter((r) => r.gstin);
  const tds = (report?.rows ?? []).filter((r) => r.tdsPaise);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Finance" title="TCS & TDS" description="What LOIMART deducted from seller payouts each month and has to deposit with the government. Give these files to your CA: TCS for GSTR-8 (by the 10th of next month), TDS under 194-O (deposit by the 7th; quarterly Form 26Q and Form 16A certificates)." />
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">{list.map((m) => <option key={m} value={m}>{label(m)}</option>)}</select>
        <button type="button" disabled={!gst.length} onClick={() => download(`loimart-gstr8-tcs-${month}.csv`, [
          ["Supplier GSTIN", "Supplier legal name", "Gross value of supplies (₹)", "Value of supplies returned (₹)", "Net amount liable for TCS (₹)", "TCS IGST (₹)", "TCS CGST (₹)", "TCS SGST (₹)"],
          ...gst.map((r) => [r.gstin, r.legalName, amount(r.suppliesPaise), amount(r.returnsPaise), amount(r.netTaxablePaise), amount(r.tcsIgstPaise), amount(r.tcsCgstPaise), amount(r.tcsSgstPaise)]),
        ])} className="rounded-full bg-chrome px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Download TCS (GSTR-8) CSV</button>
        <button type="button" disabled={!tds.length} onClick={() => download(`loimart-194o-tds-${month}.csv`, [
          ["Seller PAN", "Seller legal name", "Amount credited / paid (₹)", "TDS 194-O @0.1% (₹)"],
          ...tds.map((r) => [r.pan ?? "PAN missing (TDS 5% applies)", r.legalName, amount(r.tdsBasePaise), amount(r.tdsPaise)]),
        ])} className="rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-40">Download TDS (194-O) CSV</button>
      </div>
      {report ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[["Net supplies (before GST)", report.totals.netTaxablePaise], ["Returned after settlement", report.totals.returnsPaise], ["TCS to deposit", report.totals.tcsPaise], ["TDS to deposit", report.totals.tdsPaise]].map(([l, v]) => (
            <div key={l as string} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"><p className="text-xs text-slate-500">{l}</p><p className="mt-1 text-lg font-bold">{rupees(v as number)}</p></div>
          ))}
        </div>
      ) : null}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {!report ? <p className="p-6 text-sm text-ink-muted">Loading…</p> : report.rows.length === 0 ? <p className="p-6 text-sm text-ink-muted">No settlements in {label(month)}.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-ink-muted"><th className="px-4 py-2.5">Seller</th><th className="pr-3">GSTIN / PAN</th><th className="pr-3 text-right">Supplies</th><th className="pr-3 text-right">Returned</th><th className="pr-3 text-right">Net before GST</th><th className="pr-3 text-right">TCS (IGST / CGST / SGST)</th><th className="pr-4 text-right">TDS 194-O</th></tr></thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.sellerId} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-2.5 font-semibold">{r.legalName}<span className="block text-xs font-normal text-ink-muted">{r.storeName}{r.state ? ` · ${r.state}` : ""}</span></td>
                    <td className="pr-3 font-mono text-xs">{r.gstin ?? <span className="font-sans text-ink-muted">No GSTIN (no TCS)</span>}<span className="block">{r.pan ?? <span className="font-sans font-semibold text-red-700">PAN missing</span>}</span></td>
                    <td className="pr-3 text-right">{rupees(r.suppliesPaise)}</td>
                    <td className="pr-3 text-right">{r.returnsPaise ? "−" + rupees(r.returnsPaise) : "—"}</td>
                    <td className="pr-3 text-right">{rupees(r.netTaxablePaise)}</td>
                    <td className="pr-3 text-right font-semibold">{rupees(r.tcsPaise)}<span className="block text-xs font-normal text-ink-muted">{rupees(r.tcsIgstPaise)} / {rupees(r.tcsCgstPaise)} / {rupees(r.tcsSgstPaise)}</span></td>
                    <td className="pr-4 text-right font-semibold">{rupees(r.tdsPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-3 text-xs text-ink-muted">Supplies count in the month they were settled; goods returned after settlement reduce the month they came back. Have your CA confirm this basis and the rates before filing.</p>
    </main>
  );
}
