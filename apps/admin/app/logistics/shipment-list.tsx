"use client";

import { useCallback, useEffect, useState } from "react";

type Shipment = {
  id: string; orderId: string; orderNumber: string; sellerId: string; sellerName: string; status: string; orderStatus: string;
  awb: string | null; providerShipmentId: string | null; courierName: string | null; shippedBy: string; shippingFeePaise: number;
  destination: { city: string; state: string; postalCode: string }; createdAt: string; updatedAt: string;
};
type Tab = "all" | "loimart" | "seller" | "attention";

const NEXT: Record<string, Array<[string, string]>> = {
  CREATED: [["PICKED_UP", "Picked up"], ["CANCELLED", "Cancel booking"]],
  PICKED_UP: [["IN_TRANSIT", "In transit"], ["FAILED", "Lost / failed"]],
  IN_TRANSIT: [["OUT_FOR_DELIVERY", "Out for delivery"], ["RETURNED", "Returned to seller"]],
  OUT_FOR_DELIVERY: [["DELIVERED", "Delivered"], ["RETURNED", "Returned to seller"]],
};
const TONE: Record<string, string> = { DELIVERED: "bg-green-50 text-green-700", CANCELLED: "bg-slate-100 text-slate-500", FAILED: "bg-red-50 text-red-700", RETURNED: "bg-red-50 text-red-700", CREATED: "bg-amber-50 text-amber-800" };
const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const DAY = 86_400_000;

/** Late = booked but not picked up for 2+ days, or on the way for 7+ days. */
function isLate(s: Shipment) {
  const age = Date.now() - new Date(s.updatedAt).getTime();
  return (s.status === "CREATED" && age > 2 * DAY) || (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(s.status) && age > 7 * DAY) || s.status === "FAILED";
}

/** Every parcel: LOIMART-shipped ones can be moved along (until a courier updates them itself) or cancelled. */
export default function ShipmentList() {
  const [items, setItems] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/shipments", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to load shipments.");
      setItems(body.items ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load shipments."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function move(s: Shipment, status: string) {
    if (status === "CANCELLED" && !window.confirm(`Cancel the courier booking for ${s.orderNumber}? The seller can book it again.`)) return;
    setBusy(s.id); setError("");
    try {
      const response = await fetch(`/api/v1/shipments/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't update the shipment.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't update the shipment."); }
    finally { setBusy(""); }
  }

  if (loading) return <div className="mt-7 h-72 animate-pulse rounded-[2rem] bg-white" />;

  const counts: Record<Tab, number> = { all: items.length, loimart: items.filter((s) => s.shippedBy === "LOIMART").length, seller: items.filter((s) => s.shippedBy !== "LOIMART").length, attention: items.filter(isLate).length };
  const term = q.trim().toLowerCase();
  const shown = items.filter((s) => (tab === "all" || (tab === "loimart" ? s.shippedBy === "LOIMART" : tab === "seller" ? s.shippedBy !== "LOIMART" : isLate(s)))
    && (!term || [s.orderNumber, s.sellerName, s.awb ?? "", s.destination.postalCode, s.destination.city].some((v) => v.toLowerCase().includes(term))));
  const fees = items.filter((s) => s.shippedBy === "LOIMART" && s.status !== "CANCELLED").reduce((n, s) => n + s.shippingFeePaise, 0);

  return (
    <div className="mt-7">
      <div className="grid gap-3 sm:grid-cols-4">
        {([["In transit now", items.filter((s) => ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(s.status)).length], ["Shipped by LOIMART", counts.loimart], ["Need attention", counts.attention], ["LOIMART shipping fees", money(fees)]] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className={"mt-1 text-2xl font-black " + (label === "Need attention" && counts.attention ? "text-red-600" : "")}>{value}</p></div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {([["all", "All"], ["loimart", "LOIMART shipping"], ["seller", "Seller's own courier"], ["attention", "Need attention"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={"rounded-full border px-3 py-1.5 text-xs font-semibold " + (tab === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-900")}>{label} ({counts[k]})</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order, seller, AWB or PIN" className="ml-auto w-full rounded-full border border-slate-200 px-3 py-1.5 text-xs sm:w-60" />
      </div>
      {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!shown.length ? <div className="mt-5 rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-lg font-black">No shipments here.</p></div> : (
        <div className="mt-5 overflow-x-auto rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="p-3">Order</th><th className="p-3">Seller</th><th className="p-3">Shipped by</th><th className="p-3">Courier · AWB</th><th className="p-3">To</th><th className="p-3">Status</th><th className="p-3">Update</th></tr></thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className={"border-t border-slate-100 align-top " + (isLate(s) ? "bg-red-50/40" : "")}>
                  <td className="p-3"><p className="font-semibold">{s.orderNumber}</p><p className="text-[11px] text-slate-400">Booked {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p></td>
                  <td className="p-3">{s.sellerName}</td>
                  <td className="p-3">{s.shippedBy === "LOIMART" ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800">LOIMART · {money(s.shippingFeePaise)}</span> : <span className="text-xs text-slate-500">Seller</span>}</td>
                  <td className="p-3 text-xs">{s.courierName ?? "—"}<br /><span className="font-mono">{s.awb ?? "no tracking yet"}</span></td>
                  <td className="p-3 text-xs">{s.destination.city}, {s.destination.state}<br />{s.destination.postalCode}</td>
                  <td className="p-3"><span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + (TONE[s.status] ?? "bg-slate-100 text-slate-700")}>{s.status.replaceAll("_", " ")}</span>{isLate(s) ? <p className="mt-1 text-[11px] font-semibold text-red-600">Late</p> : null}</td>
                  <td className="p-3">
                    {s.shippedBy === "LOIMART" && NEXT[s.status] ? (
                      <div className="flex flex-wrap gap-1.5">
                        {NEXT[s.status]!.map(([status, label]) => <button key={status} type="button" disabled={busy === s.id} onClick={() => void move(s, status)} className={"rounded-full px-2.5 py-1 text-[11px] font-bold disabled:opacity-40 " + (["CANCELLED", "FAILED", "RETURNED"].includes(status) ? "border border-red-200 text-red-700 hover:bg-red-50" : "bg-slate-900 text-white")}>{label}</button>)}
                      </div>
                    ) : <span className="text-[11px] text-slate-400">{s.shippedBy === "LOIMART" ? "—" : "Seller updates"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
