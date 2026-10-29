"use client";

import { useEffect, useState } from "react";
import { RETURN_REASONS } from "@azadimart/shared";

type Item = { id: string; title: string; quantity: number };
type ReturnLine = { id: string; status: "REQUESTED" | "APPROVED" | "PICKUP_SCHEDULED" | "RECEIVED" | "REFUNDED" | "REJECTED"; reason: string | null; rejectionReason: string | null; createdAt: string; orderItemId: string; quantity: number };
type Data = { items: ReturnLine[]; windowDays: number; returnUntil: string | null; canReturn: boolean };

const REASONS = RETURN_REASONS;
const STATUS: Record<ReturnLine["status"], [string, string]> = {
  REQUESTED: ["Return requested · waiting for the seller", "bg-amber-50 text-amber-800"],
  APPROVED: ["Return approved · pickup coming", "bg-sky-50 text-sky-700"],
  PICKUP_SCHEDULED: ["Pickup booked: keep the item packed", "bg-indigo-50 text-indigo-700"],
  RECEIVED: ["Item received back · refund on its way", "bg-sky-50 text-sky-700"],
  REFUNDED: ["Refunded", "bg-green-50 text-green-700"],
  REJECTED: ["Return not accepted", "bg-slate-100 text-slate-600"],
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Return items from a delivered order (within the return window), and follow returns already asked for. */
export default function ReturnItems({ orderId, items }: { orderId: string; items: Item[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => fetch(`/api/v1/orders/${orderId}/returns`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => undefined);
  useEffect(() => { void load(); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return null;

  const asked = (id: string) => data.items.filter((r) => r.orderItemId === id && r.status !== "REJECTED").reduce((s, r) => s + r.quantity, 0);
  const left = items.map((i) => ({ ...i, left: i.quantity - asked(i.id) })).filter((i) => i.left > 0);
  const chosen = Object.entries(qty).filter(([, n]) => n > 0);
  async function send() {
    setBusy(true); setError("");
    const text = [reason, details.trim()].filter(Boolean).join(": ");
    const r = await fetch(`/api/v1/orders/${orderId}/returns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: text, items: chosen.map(([orderItemId, quantity]) => ({ orderItemId, quantity })) }) });
    const b = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { setError(b?.error?.message ?? "Couldn't send your return request. Try again."); return; }
    setOpen(false); setQty({}); setReason(""); setDetails(""); void load();
  }
  const groups = [...new Map(data.items.map((r) => [r.id, r])).values()];

  return (
    <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Returns</h2>
          <p className="mt-1 text-sm text-slate-500">{data.canReturn && data.returnUntil ? `You can return items until ${day(data.returnUntil)} (${data.windowDays} days after delivery).` : data.returnUntil ? `The return window closed on ${day(data.returnUntil)}.` : `Items can be returned within ${data.windowDays} days of delivery.`}</p>
        </div>
        {data.canReturn && left.length && !open ? <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Return items</button> : null}
      </div>

      {groups.length ? <ul className="mt-4 space-y-3">{groups.map((g) => (
        <li key={g.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
          <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + STATUS[g.status][1]}>{STATUS[g.status][0]}</span>
          <ul className="mt-2 text-slate-700">{data.items.filter((r) => r.id === g.id).map((r) => <li key={r.orderItemId}>{r.quantity} × {items.find((i) => i.id === r.orderItemId)?.title ?? "Item"}</li>)}</ul>
          <p className="mt-1 text-xs text-slate-500">Asked on {day(g.createdAt)}{g.reason ? ` · ${g.reason}` : ""}</p>
          {g.status === "REJECTED" && g.rejectionReason ? <p className="mt-1 text-xs text-slate-600">Why: {g.rejectionReason}. Not right? Contact LOIMART support from Help.</p> : null}
          {g.status === "REFUNDED" ? <p className="mt-1 text-xs text-slate-600">Online payments go back to your card or UPI in 5–7 working days; Cash on Delivery refunds are sent to your bank or UPI. LOIMART wallet money goes back to your wallet.</p> : null}
        </li>
      ))}</ul> : null}

      {open ? (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <div><p className="text-sm font-semibold">What are you returning?</p>
            <ul className="mt-2 space-y-2">{left.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                <label className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={(qty[i.id] ?? 0) > 0} onChange={(e) => setQty({ ...qty, [i.id]: e.target.checked ? 1 : 0 })} /><span className="truncate">{i.title}</span></label>
                {i.left > 1 && (qty[i.id] ?? 0) > 0 ? <select value={qty[i.id]} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })} aria-label="How many" className="rounded-lg border border-slate-300 px-2 py-1">{Array.from({ length: i.left }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}</select> : null}
              </li>
            ))}</ul>
          </div>
          <label className="block text-sm font-semibold">Why?
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"><option value="">Choose a reason</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
          <label className="block text-sm font-semibold">More details (optional)<textarea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 300))} rows={2} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
          <p className="text-xs text-slate-500">Keep the item unused with its tags and packaging. The seller confirms within 2 days, then a courier picks it up. Your refund is sent once it reaches the seller. Delivery and platform fees aren&apos;t refunded.</p>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-3"><button type="button" disabled={busy || !chosen.length || !reason} onClick={() => void send()} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy ? "Sending…" : "Request return"}</button><button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-slate-500">Cancel</button></div>
        </div>
      ) : null}
    </section>
  );
}
