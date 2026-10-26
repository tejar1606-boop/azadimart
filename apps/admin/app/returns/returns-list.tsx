"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { returnIsSellerFault, splitReturnShipping } from "@azadimart/shared";

type Status = "REQUESTED" | "APPROVED" | "PICKUP_SCHEDULED" | "RECEIVED" | "REFUNDED" | "REJECTED";
type Row = {
  id: string; status: Status; reason: string | null; rejectionReason: string | null; returnShippingFeePaise: number; createdAt: string; updatedAt: string;
  orderNumber: string; deliveredAt: string | null; customerName: string; city: string | null; state: string | null; storeName: string;
  items: Array<{ orderItemId: string; title: string; sku: string; quantity: number; unitPricePaise: number; reason: string | null }>;
};
type Data = { items: Row[]; counts: Partial<Record<Status, number>>; total: number; page: number; pages: number };
type Quote = { goodsPaise: number; lessDiscountPaise: number; toWalletPaise: number; toCustomerPaise: number; payment: { method: "COD" | "RAZORPAY" | "CASHFREE"; refundablePaise: number } | null };

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const date = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const LABEL: Record<Status, [string, string]> = {
  REQUESTED: ["Requested", "bg-amber-50 text-amber-800"], APPROVED: ["Approved · pickup to book", "bg-sky-50 text-sky-700"],
  PICKUP_SCHEDULED: ["Pickup scheduled", "bg-indigo-50 text-indigo-700"], RECEIVED: ["Received · to refund", "bg-brand-50 text-brand-600"],
  REFUNDED: ["Refunded", "bg-green-50 text-green-700"], REJECTED: ["Rejected", "bg-slate-100 text-slate-500"],
};
const TABS: Array<[string, string]> = [["OPEN", "Open"], ["REQUESTED", "Requested"], ["APPROVED", "Approved"], ["PICKUP_SCHEDULED", "Pickup"], ["RECEIVED", "To refund"], ["REFUNDED", "Refunded"], ["REJECTED", "Rejected"], ["ALL", "All"]];
const NEXT: Partial<Record<Status, Array<[Status, string]>>> = {
  REQUESTED: [["APPROVED", "Approve"]], APPROVED: [["PICKUP_SCHEDULED", "Pickup scheduled"]], PICKUP_SCHEDULED: [["RECEIVED", "Mark received"]],
};
const STUCK_MS = 2 * 24 * 60 * 60 * 1000;

function Refund({ row, done }: { row: Row; done: () => void }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState<"GATEWAY" | "MANUAL">("MANUAL");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/v1/returns/${row.id}/refund`, { cache: "no-store" }).then((r) => r.json()).then((q: Quote) => {
      setQuote(q); setAmount(String(q.toCustomerPaise / 100)); setMethod(q.payment && q.payment.method !== "COD" ? "GATEWAY" : "MANUAL");
    });
  }, [row.id]);
  async function pay() {
    setBusy(true); setError("");
    const r = await fetch(`/api/v1/returns/${row.id}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, reference, amountPaise: Math.round(Number(amount) * 100) }) });
    const b = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { setError(b?.error?.message ?? "Couldn't refund"); return; }
    done();
  }
  if (!quote) return <p className="mt-3 text-sm text-slate-500">Working out the refund…</p>;
  const cod = quote.payment?.method === "COD";
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm">
      <dl className="grid gap-1 sm:max-w-sm">
        <div className="flex justify-between"><dt>Items returned</dt><dd>{money(quote.goodsPaise)}</dd></div>
        {quote.lessDiscountPaise ? <div className="flex justify-between"><dt>Less LOIMART offer on them</dt><dd>−{money(quote.lessDiscountPaise)}</dd></div> : null}
        {quote.toWalletPaise ? <div className="flex justify-between"><dt>Back to LOIMART wallet</dt><dd>{money(quote.toWalletPaise)}</dd></div> : null}
        <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>To the customer</dt><dd>{money(quote.toCustomerPaise)}</dd></div>
      </dl>
      <p className="mt-1 text-xs text-slate-500">Delivery and the platform fee aren&apos;t refunded. Paid by {cod ? "Cash on Delivery" : quote.payment ? "online payment" : "—"}.</p>
      <div className="mt-3 flex flex-wrap gap-4">
        {!cod && quote.payment ? <label className="flex items-center gap-2"><input type="radio" checked={method === "GATEWAY"} onChange={() => setMethod("GATEWAY")} />Back to their card/UPI (payment gateway)</label> : null}
        <label className="flex items-center gap-2"><input type="radio" checked={method === "MANUAL"} onChange={() => setMethod("MANUAL")} />Paid manually (bank transfer / UPI)</label>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium">Amount (₹)<input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        {method === "MANUAL" ? <label className="text-xs font-medium">UTR / UPI reference<input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 block w-52 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" /></label> : null}
        <button type="button" disabled={busy} onClick={() => void pay()} className="rounded-full bg-chrome px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Refunding…" : "Refund"}</button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function Card({ row, reload }: { row: Row; reload: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stuck = row.status === "REQUESTED" && Date.now() - new Date(row.createdAt).getTime() > STUCK_MS;
  async function move(status: Status) {
    setBusy(true); setError("");
    const r = await fetch(`/api/v1/returns/${row.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, notes }) });
    const b = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { setError(b?.error?.message ?? "Couldn't update"); return; }
    reload();
  }
  const value = row.items.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
  return (
    <li className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold"><Link href={`/orders?q=${encodeURIComponent(row.orderNumber)}`} className="hover:underline">{row.orderNumber}</Link> <span className="font-normal text-slate-500">· {row.customerName}{row.city ? `, ${row.city}` : ""}{row.state ? `, ${row.state}` : ""}</span></p>
          <p className="text-xs text-slate-500">Seller: <b className="text-slate-700">{row.storeName}</b> · requested {date(row.createdAt)}{row.deliveredAt ? ` · delivered ${date(row.deliveredAt)}` : ""}</p>
        </div>
        <span className="flex items-center gap-2">{stuck ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Seller hasn&apos;t replied in 2+ days</span> : null}<span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + LABEL[row.status][1]}>{LABEL[row.status][0]}</span></span>
      </div>
      <ul className="mt-3 space-y-1 text-sm">{row.items.map((i) => (
        <li key={i.orderItemId}>{i.quantity} × {i.title} <span className="text-xs text-slate-400">({i.sku}) · {money(i.unitPricePaise)} each</span>{i.reason ? <span className="block text-xs text-slate-600">“{i.reason}”</span> : null}</li>
      ))}</ul>
      {row.reason ? <p className="mt-2 text-sm text-slate-600">Customer&apos;s reason: “{row.reason}”</p> : null}
      {row.rejectionReason ? <p className="mt-2 text-sm text-slate-600">Rejected because: “{row.rejectionReason}”</p> : null}
      {row.returnShippingFeePaise ? <p className="mt-2 text-xs text-slate-500">Return pickup courier {money(row.returnShippingFeePaise)}: {returnIsSellerFault(row.reason) ? <>seller pays all of it (seller&apos;s fault), from their payout</> : <>seller {money(splitReturnShipping(row.returnShippingFeePaise).sellerPaise)} (60%, from their payout) · LOIMART {money(splitReturnShipping(row.returnShippingFeePaise).loimartPaise)} (40%)</>}</p> : null}
      <p className="mt-1 text-xs text-slate-400">Item value {money(value)}</p>

      {["REQUESTED", "APPROVED", "PICKUP_SCHEDULED"].includes(row.status) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(NEXT[row.status] ?? []).map(([s, label]) => <button key={s} type="button" disabled={busy} onClick={() => void move(s)} className="rounded-full bg-chrome px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{label}</button>)}
          {!rejecting ? <button type="button" onClick={() => setRejecting(true)} className="rounded-full px-4 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:ring-red-700">Reject…</button> : <>
            <input autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason (the customer sees this)" className="w-64 rounded-full border border-slate-300 px-3 py-1.5 text-xs" />
            <button type="button" disabled={busy || notes.trim().length < 3} onClick={() => void move("REJECTED")} className="rounded-full bg-red-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Reject return</button>
            <button type="button" onClick={() => { setRejecting(false); setNotes(""); }} className="text-xs font-semibold text-slate-500">Cancel</button></>}
        </div>
      ) : null}
      {row.status === "RECEIVED" ? (!refunding ? <button type="button" onClick={() => setRefunding(true)} className="mt-3 rounded-full bg-chrome px-4 py-1.5 text-xs font-semibold text-white">Refund customer…</button> : <Refund row={row} done={reload} />) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </li>
  );
}

/** Returns across all sellers, with LOIMART's actions and the refund step. */
export default function ReturnsList() {
  const [tab, setTab] = useState("OPEN");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => { setQ(query.trim()); setPage(1); }, 300); return () => window.clearTimeout(t); }, [query]);
  const load = useCallback(() => {
    setError(false);
    void fetch(`/api/v1/returns?${new URLSearchParams({ status: tab, q, page: String(page) })}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError(true));
  }, [tab, q, page]);
  useEffect(() => { load(); }, [load]);
  const c = data?.counts ?? {};
  const count = (key: string) => key === "ALL" ? Object.values(c).reduce((s, n) => s + (n ?? 0), 0) : key === "OPEN" ? (c.REQUESTED ?? 0) + (c.APPROVED ?? 0) + (c.PICKUP_SCHEDULED ?? 0) + (c.RECEIVED ?? 0) : c[key as Status] ?? 0;

  return (
    <>
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["Waiting for seller", c.REQUESTED], ["Pickup to do", (c.APPROVED ?? 0) + (c.PICKUP_SCHEDULED ?? 0)], ["To refund", c.RECEIVED], ["Refunded", c.REFUNDED]] as const).map(([label, v]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{data ? v ?? 0 : "…"}</p></div>
        ))}
      </section>
      <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order, customer, seller or product" aria-label="Search returns" className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-900 sm:max-w-sm" />
          <div className="flex flex-wrap gap-1.5">{TABS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => { setTab(key); setPage(1); }} className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (tab === key ? "bg-chrome text-white" : "ring-1 ring-slate-300 hover:ring-slate-900")}>{label} <span className="opacity-60">{data ? count(key) : ""}</span></button>
          ))}</div>
        </div>
        {error ? <p className="p-8 text-center text-sm text-red-700">Couldn&apos;t load returns. Try again.</p> : !data ? <p className="p-8 text-center text-sm text-slate-500">Loading…</p> : data.items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{q ? `No return matches “${q}”.` : "No returns here."}</p> : (
          <ul className="divide-y divide-slate-100">{data.items.map((row) => <Card key={row.id + row.status} row={row} reload={load} />)}</ul>
        )}
        {data && data.pages > 1 ? <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
          <span className="text-slate-500">Page {data.page} of {data.pages}</span>
          <span className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-full px-3 py-1.5 ring-1 ring-slate-300 disabled:opacity-40">Previous</button><button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded-full px-3 py-1.5 ring-1 ring-slate-300 disabled:opacity-40">Next</button></span>
        </div> : null}
      </section>
    </>
  );
}
