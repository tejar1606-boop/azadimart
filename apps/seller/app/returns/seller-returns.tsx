"use client";

import { useCallback, useEffect, useState } from "react";
import { returnDeadline, returnIsSellerFault, splitReturnShipping } from "@azadimart/shared";
import { PortalPageHeader } from "@azadimart/ui";

type Status = "REQUESTED" | "APPROVED" | "PICKUP_SCHEDULED" | "RECEIVED" | "REFUNDED" | "REJECTED";
type Row = {
  id: string; status: Status; reason: string | null; rejectionReason: string | null; returnShippingFeePaise: number; createdAt: string; updatedAt: string; orderNumber: string; deliveredAt: string | null;
  customerName: string; city: string | null; state: string | null;
  items: Array<{ orderItemId: string; title: string; sku: string; quantity: number; unitPricePaise: number; reason: string | null }>;
};
type Data = { items: Row[]; counts: Partial<Record<Status, number>>; late: number; page: number; pages: number };

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const due = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const LABEL: Record<Status, [string, string]> = {
  REQUESTED: ["New request", "bg-amber-50 text-amber-800"], APPROVED: ["Approved · book the pickup", "bg-sky-50 text-sky-700"],
  PICKUP_SCHEDULED: ["Pickup booked", "bg-indigo-50 text-indigo-700"], RECEIVED: ["Received · LOIMART refunds the customer", "bg-green-50 text-green-700"],
  REFUNDED: ["Customer refunded", "bg-green-50 text-green-700"], REJECTED: ["Rejected", "bg-slate-100 text-slate-500"],
};
const TABS: Array<[string, string]> = [["OPEN", "To do"], ["LATE", "Late"], ["REQUESTED", "New"], ["APPROVED", "Approved"], ["PICKUP_SCHEDULED", "Pickup booked"], ["RECEIVED", "Received"], ["REFUNDED", "Refunded"], ["REJECTED", "Rejected"], ["ALL", "All"]];
const NEXT: Partial<Record<Status, [Status, string]>> = { REQUESTED: ["APPROVED", "Approve return"], APPROVED: ["PICKUP_SCHEDULED", "Pickup booked"], PICKUP_SCHEDULED: ["RECEIVED", "Item received back"] };

function Card({ row, reload }: { row: Row; reload: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function move(status: Status) {
    if (status === "RECEIVED" && !window.confirm("Mark as received? Stock goes back up and the sale is reversed on your invoice.")) return;
    setBusy(true); setError("");
    const r = await fetch(`/api/v1/returns/${row.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, notes }) });
    const b = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { setError(b?.error?.message ?? "Couldn't update"); return; }
    reload();
  }
  const next = NEXT[row.status];
  const deadline = returnDeadline(row.status, row.updatedAt);
  return (
    <li className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{row.orderNumber} <span className="font-normal text-slate-500">· {row.customerName}{row.city ? `, ${row.city}` : ""}</span></p>
          <p className="text-xs text-slate-500">Requested {date(row.createdAt)}{row.deliveredAt ? ` · delivered ${date(row.deliveredAt)}` : ""}</p>
        </div>
        <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + LABEL[row.status][1]}>{LABEL[row.status][0]}</span>
      </div>
      <ul className="mt-3 space-y-1 text-sm">{row.items.map((i) => (
        <li key={i.orderItemId}>{i.quantity} × {i.title} <span className="text-xs text-slate-400">({i.sku}) · {money(i.unitPricePaise)} each</span>{i.reason ? <span className="block text-xs text-slate-600">“{i.reason}”</span> : null}</li>
      ))}</ul>
      {row.reason ? <p className="mt-2 text-sm text-slate-600">Customer&apos;s reason: “{row.reason}”</p> : null}
      {deadline?.who === "SELLER" ? <p className={"mt-2 rounded-lg px-3 py-2 text-xs font-semibold " + (deadline.overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800")}>{deadline.overdue ? `Late: ${deadline.task.toLowerCase()} was due ${due(deadline.dueAt)}. LOIMART may step in.` : `${deadline.task} by ${due(deadline.dueAt)}${row.status === "REQUESTED" ? ", or LOIMART approves it automatically" : ""}.`}</p> : null}
      {row.rejectionReason ? <p className="mt-2 text-sm text-slate-600">Rejected because: “{row.rejectionReason}”</p> : null}
      {row.returnShippingFeePaise ? <p className="mt-2 text-xs text-slate-500">Return pickup courier {money(row.returnShippingFeePaise)}: {returnIsSellerFault(row.reason) ? <>you pay all of it ({row.reason?.split(":")[0]?.toLowerCase()}), from your next payout.</> : <>you pay 60% ({money(splitReturnShipping(row.returnShippingFeePaise).sellerPaise)}, from your next payout), LOIMART pays 40%.</>}</p> : row.status === "APPROVED" || row.status === "PICKUP_SCHEDULED" ? <p className="mt-2 text-xs text-slate-500">{returnIsSellerFault(row.reason) ? "Return pickup courier: you pay all of it, since the item was damaged, wrong, not as described or incomplete (charged when the item is received)." : "Return pickup courier: you pay 60%, LOIMART pays 40% (charged when the item is received)."}</p> : null}
      {next ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void move(next[0])} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{next[1]}</button>
          {!rejecting ? <button type="button" onClick={() => setRejecting(true)} className="rounded-full px-4 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:ring-rose-700">Reject…</button> : <>
            <input autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason (the customer sees this)" className="w-64 rounded-full border border-slate-300 px-3 py-2 text-xs" />
            <button type="button" disabled={busy || notes.trim().length < 3} onClick={() => void move("REJECTED")} className="rounded-full bg-rose-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Reject return</button>
            <button type="button" onClick={() => { setRejecting(false); setNotes(""); }} className="text-xs font-semibold text-slate-500">Cancel</button></>}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </li>
  );
}

/** A seller's returns: approve or reject, book the pickup, mark received. LOIMART refunds the customer. */
export default function SellerReturns() {
  const [tab, setTab] = useState("OPEN");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(() => {
    void fetch(`/api/v1/returns?${new URLSearchParams({ status: tab, page: String(page) })}`, { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => undefined);
  }, [tab, page]);
  useEffect(() => { load(); }, [load]);
  const c = data?.counts ?? {};
  const count = (key: string) => key === "LATE" ? data?.late ?? 0 : key === "ALL" ? Object.values(c).reduce((s, n) => s + (n ?? 0), 0) : key === "OPEN" ? (c.REQUESTED ?? 0) + (c.APPROVED ?? 0) + (c.PICKUP_SCHEDULED ?? 0) : c[key as Status] ?? 0;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Manage business" title="Returns" description="Customers can return items within the return window after delivery. Approve or reject each request within 48 hours (or LOIMART approves it automatically), book the pickup within 2 days, and mark the item received within 7 days of the pickup. LOIMART refunds the customer; the sale is reversed on your invoice and payout." />
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 p-4">{TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => { setTab(key); setPage(1); }} className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (tab === key ? "bg-slate-950 text-white" : "ring-1 ring-slate-300 hover:ring-slate-900")}>{label} <span className="opacity-60">{data ? count(key) : ""}</span></button>
        ))}</div>
        {!data ? <p className="p-8 text-center text-sm text-slate-500">Loading…</p> : data.items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{tab === "OPEN" ? "No returns to handle. 🎉" : "No returns here."}</p> : (
          <ul className="divide-y divide-slate-100">{data.items.map((row) => <Card key={row.id + row.status} row={row} reload={load} />)}</ul>
        )}
        {data && data.pages > 1 ? <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-full px-3 py-1.5 ring-1 ring-slate-300 disabled:opacity-40">Previous</button><button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded-full px-3 py-1.5 ring-1 ring-slate-300 disabled:opacity-40">Next</button></div> : null}
      </section>
    </main>
  );
}
