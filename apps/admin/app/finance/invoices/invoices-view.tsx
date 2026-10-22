"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Company = { legalName: string; tradeName: string; gstin: string | null; pan: string | null; cin: string | null; address: string; state: string; email: string | null };
type Row = { id: string; kind: "TAX_INVOICE" | "BILL_OF_SUPPLY" | "CREDIT_NOTE"; number: string; issuedAt: string; isTest: boolean; taxablePaise: number; taxPaise: number; totalPaise: number; orderNumber: string; storeName: string; buyer: string | null };

const KIND = { TAX_INVOICE: "Tax invoice", BILL_OF_SUPPLY: "Bill of supply", CREDIT_NOTE: "Credit note" } as const;
const rupees = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** LOIMART's company details for invoices, and every invoice and credit note issued for sellers. */
export default function InvoicesView() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"orders" | "fees">("orders");
  useEffect(() => { if (new URLSearchParams(window.location.search).get("tab") === "fees") setTab("fees"); }, []);
  useEffect(() => {
    const t = setTimeout(() => { void fetch(`/api/v1/finance/invoices?q=${encodeURIComponent(q)}&kind=${kind}`, { cache: "no-store" }).then((r) => r.json()).then((b) => setRows(b.items ?? [])).catch(() => setRows([])); }, 250);
    return () => clearTimeout(t);
  }, [q, kind]);
  const chip = (active: boolean) => "rounded-full px-3.5 py-1.5 text-xs font-semibold " + (active ? "bg-chrome text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900");

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Finance" title="Invoices" description="LOIMART issues each seller's invoice to the customer automatically when the parcel is picked up: a tax invoice from GST-registered sellers, a bill of supply from Enrolment ID sellers. Returns and undelivered parcels get a credit note. Numbers run per seller per financial year." />
      <CompanyForm />
      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {([["orders", "Seller → customer invoices"], ["fees", "LOIMART → seller fee invoices"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setTab(v)} className={"-mb-px border-b-2 px-4 py-2 text-sm font-semibold " + (tab === v ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900")}>{l}</button>)}
      </div>
      {tab === "fees" ? <FeeInvoices /> : <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice no., order no. or seller" className="w-full max-w-sm rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-900" />
        {([["", "All"], ["TAX_INVOICE", "Tax invoices"], ["BILL_OF_SUPPLY", "Bills of supply"], ["CREDIT_NOTE", "Credit notes"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setKind(v)} className={chip(kind === v)}>{l}</button>)}
      </div>
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {!rows ? <p className="p-6 text-sm text-ink-muted">Loading…</p> : rows.length === 0 ? <p className="p-6 text-sm text-ink-muted">No invoices yet. They appear when a parcel is picked up by the courier.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-ink-muted"><th className="px-4 py-2.5">Number</th><th className="pr-3">Date</th><th className="pr-3">Seller</th><th className="pr-3">Customer · order</th><th className="pr-3 text-right">Taxable</th><th className="pr-3 text-right">GST</th><th className="pr-4 text-right">Total</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5"><Link href={`/finance/invoices/${r.id}`} className="font-mono font-semibold hover:underline">{r.number}</Link><span className="block text-xs text-ink-muted">{KIND[r.kind]}{r.isTest ? " · TEST" : ""}</span></td>
                    <td className="pr-3 text-xs text-ink-muted">{new Date(r.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="pr-3">{r.storeName}</td>
                    <td className="pr-3">{r.buyer ?? "—"}<span className="block font-mono text-xs text-ink-muted">{r.orderNumber}</span></td>
                    <td className="pr-3 text-right">{rupees(r.taxablePaise)}</td>
                    <td className="pr-3 text-right">{rupees(r.taxPaise)}</td>
                    <td className={"pr-4 text-right font-semibold " + (r.kind === "CREDIT_NOTE" ? "text-red-700" : "")}>{r.kind === "CREDIT_NOTE" ? "−" : ""}{rupees(r.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>}
    </main>
  );
}

type FeeRow = { id: string; kind: "INVOICE" | "CREDIT_NOTE"; number: string; issuedAt: string; isTest: boolean; storeName: string; gstin: string | null; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number };

/** LOIMART's own invoices to sellers for commission, courier and ads (one per settlement). */
function FeeInvoices() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<FeeRow[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { void fetch(`/api/v1/finance/fee-invoices?q=${encodeURIComponent(q)}`, { cache: "no-store" }).then((r) => r.json()).then((b) => setRows(b.items ?? [])).catch(() => setRows([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const total = (k: "taxablePaise" | "totalPaise") => (rows ?? []).reduce((n, r) => n + (r.kind === "CREDIT_NOTE" ? -r[k] : r[k]), 0);
  return (
    <>
      <p className="mt-4 text-sm text-slate-600">Issued automatically with every settlement: LOIMART&apos;s commission (+18% GST), courier fees and ads. These are LOIMART&apos;s own sales, so report them in LOIMART&apos;s GSTR-1 (B2B for sellers with a GSTIN).</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice no. or seller" className="mt-3 w-full max-w-sm rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-900" />
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {!rows ? <p className="p-6 text-sm text-ink-muted">Loading…</p> : rows.length === 0 ? <p className="p-6 text-sm text-ink-muted">No fee invoices yet. One is issued with each settlement that has fees.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-ink-muted"><th className="px-4 py-2.5">Number</th><th className="pr-3">Date</th><th className="pr-3">Seller</th><th className="pr-3 text-right">Taxable</th><th className="pr-3 text-right">GST</th><th className="pr-4 text-right">Total</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5"><Link href={`/finance/fee-invoices/${r.id}`} className="font-mono font-semibold hover:underline">{r.number}</Link><span className="block text-xs text-ink-muted">{r.kind === "CREDIT_NOTE" ? "Credit note" : "Invoice"}{r.isTest ? " · TEST" : ""}</span></td>
                    <td className="pr-3 text-xs text-ink-muted">{new Date(r.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="pr-3">{r.storeName}<span className="block font-mono text-xs text-ink-muted">{r.gstin ?? "Unregistered"}</span></td>
                    <td className="pr-3 text-right">{rupees(r.taxablePaise)}</td>
                    <td className="pr-3 text-right">{rupees(r.cgstPaise + r.sgstPaise + r.igstPaise)}</td>
                    <td className={"pr-4 text-right font-semibold " + (r.kind === "CREDIT_NOTE" ? "text-red-700" : "")}>{r.kind === "CREDIT_NOTE" ? "−" : ""}{rupees(r.totalPaise)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 font-semibold"><td className="px-4 py-2.5" colSpan={3}>Total shown</td><td className="pr-3 text-right">{rupees(total("taxablePaise"))}</td><td className="pr-3 text-right">{rupees(total("totalPaise") - total("taxablePaise"))}</td><td className="pr-4 text-right">{rupees(total("totalPaise"))}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const EMPTY: Company = { legalName: "", tradeName: "LOIMART", gstin: "", pan: "", cin: "", address: "", state: "", email: "" };

function CompanyForm() {
  const [form, setForm] = useState<Company>(EMPTY);
  const [saved, setSaved] = useState<Company | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    fetch("/api/v1/finance/company", { cache: "no-store" }).then((r) => r.json()).then((b) => {
      if (b?.details) { setForm({ ...EMPTY, ...b.details }); setSaved(b.details); if (!b.details.address) setOpen(true); }
    }).catch(() => undefined);
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const r = await fetch("/api/v1/finance/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { const d = b?.error?.details?.[0]; throw new Error(d ? `${d.path?.[0] ?? ""}: ${d.message}` : b?.error?.message ?? "Couldn't save"); }
      setSaved(b.details); setForm({ ...EMPTY, ...b.details }); setOpen(false);
      setMessage({ ok: true, text: b.details.gstin ? "Saved. New invoices show these details." : "Saved. Invoices stay marked TEST until LOIMART's GSTIN is added." });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't save" }); }
    finally { setBusy(false); }
  }
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900";
  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const ready = Boolean(saved?.gstin && saved.address);

  return (
    <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">LOIMART company details</h2>
          <p className="mt-0.5 text-xs text-slate-500">Printed on every invoice as the e-commerce operator. {ready ? "" : "Until the GSTIN is added, invoices are marked TEST."}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + (ready ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800")}>{ready ? "Ready" : "GSTIN needed"}</span>
          {saved && !open ? <button type="button" onClick={() => setOpen(true)} className="rounded-full px-4 py-1.5 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Edit</button> : null}
        </div>
      </div>
      {!open && saved ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Legal name</dt><dd className="font-medium">{saved.legalName}</dd></div>
          <div><dt className="text-xs text-slate-500">GSTIN</dt><dd className="font-mono font-medium">{saved.gstin || "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">PAN</dt><dd className="font-mono font-medium">{saved.pan || "—"}</dd></div>
          <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Registered address</dt><dd>{saved.address || "—"}</dd></div>
        </dl>
      ) : (
        <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Registered (legal) name<input className={field} value={form.legalName} onChange={set("legalName")} placeholder="e.g. LOIMART Private Limited" maxLength={160} required /></label>
          <label className="text-sm font-medium">Brand name<input className={field} value={form.tradeName} onChange={set("tradeName")} maxLength={80} required /></label>
          <label className="text-sm font-medium">GSTIN<input className={field + " font-mono uppercase"} value={form.gstin ?? ""} onChange={set("gstin")} placeholder="15 characters" maxLength={15} /></label>
          <label className="text-sm font-medium">PAN<input className={field + " font-mono uppercase"} value={form.pan ?? ""} onChange={set("pan")} maxLength={10} /></label>
          <label className="text-sm font-medium">CIN (company number, optional)<input className={field + " font-mono uppercase"} value={form.cin ?? ""} onChange={set("cin")} maxLength={21} /></label>
          <label className="text-sm font-medium">State<input className={field} value={form.state} onChange={set("state")} placeholder="e.g. Andhra Pradesh" maxLength={80} required /></label>
          <label className="text-sm font-medium sm:col-span-2">Registered address<textarea className={field} rows={2} value={form.address} onChange={set("address")} maxLength={400} required /></label>
          <label className="text-sm font-medium">Accounts email (optional)<input className={field} type="email" value={form.email ?? ""} onChange={set("email")} maxLength={120} /></label>
          <div className="flex items-end gap-2">
            <button disabled={busy} className="rounded-full bg-chrome px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save details"}</button>
            {saved?.address ? <button type="button" onClick={() => { setForm({ ...EMPTY, ...saved }); setOpen(false); }} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button> : null}
          </div>
        </form>
      )}
      {message ? <p className={"mt-3 rounded-lg px-3 py-2 text-sm " + (message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{message.text}</p> : null}
    </section>
  );
}
