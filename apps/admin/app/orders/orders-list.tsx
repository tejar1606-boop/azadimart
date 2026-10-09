"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Order = {
  id: string;
  orderNumber: string;
  customerId: string;
  status: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  grandTotalPaise: number;
  couponCode: string | null;
  createdAt: string;
  paymentStatus: string | null;
  sellerCount: number;
  sellers: string[];
  itemCount: number;
  shipByAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  cancelRequestedAt: string | null;
  cancelRequestReason: string | null;
};

const CANCELLED_BY: Record<string, string> = { CUSTOMER: "the customer", SELLER: "the seller", ADMIN: "AzadiMart", SYSTEM: "AzadiMart (not shipped in time)" };
const OPEN = ["CREATED", "PAYMENT_PENDING", "PAID", "CONFIRMED", "PACKED"];

/** "Ship by 12 Oct" chip, red and "LATE" once the date has passed on an unshipped order. */
function ShipBy({ order }: { order: Order }) {
  if (!order.shipByAt || !OPEN.includes(order.status)) return null;
  const late = new Date(order.shipByAt).getTime() < Date.now();
  const date = new Date(order.shipByAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return <span className={"rounded-full px-3 py-1 text-xs font-bold " + (late ? "bg-red-600 text-white" : "bg-sky-50 text-sky-700")}>{late ? "LATE · was due " + date : "Ship by " + date}</span>;
}

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function OrdersList() {
  const [items, setItems] = useState<Order[]>([]);
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/orders", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to load orders.");
      setItems(body.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const requests = items.filter((order) => order.cancelRequestedAt && OPEN.includes(order.status));
  const filtered = useMemo(
    () => status === "ALL" ? items
      : status === "LATE" ? items.filter((order) => OPEN.includes(order.status) && order.shipByAt && new Date(order.shipByAt).getTime() < Date.now())
      : items.filter((order) => order.status === status),
    [items, status],
  );

  async function act(order: Order | null, path: string, init: RequestInit, done: string) {
    setWorking(order?.id ?? "deadline"); setActionError(""); setNotice("");
    try {
      const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Action failed.");
      setNotice(done || (body && "checked" in body ? `Deadline check done: ${body.checked} open order(s) checked, ${body.reminded} reminder(s), ${body.late} late alert(s), ${body.autoCancelled} auto-cancelled${body.skipped ? `, ${body.skipped} need you (e.g. prepaid refund)` : ""}.` : ""));
      await load();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
      return false;
    } finally {
      setWorking(null);
    }
  }
  const decide = (order: Order, decision: "APPROVE" | "DECLINE") =>
    act(order, `/api/v1/orders/${order.id}/cancel-request`, { method: "POST", body: JSON.stringify({ decision }) }, decision === "APPROVE" ? `${order.orderNumber} cancelled and the customer refunded.` : `Request declined; the seller has been told to ship ${order.orderNumber}.`);
  async function confirmCancel() {
    if (!cancelling || reason.trim().length < 3) return;
    const ok = await act(cancelling, "/api/v1/orders/" + cancelling.id, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED", notes: reason.trim() }) }, `${cancelling.orderNumber} cancelled.`);
    if (ok) { setCancelling(null); setReason(""); }
  }

  if (loading) return <div className="mt-7 h-96 animate-pulse rounded-3xl bg-white" />;
  async function updateStatus(order: Order, nextStatus: string) {
    setWorking(order.id); setActionError("");
    try {
      const response = await fetch("/api/v1/orders/" + order.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to update order.");
      setItems(current => current.map(item => item.id === order.id ? { ...item, status: nextStatus } : item));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update order.");
    } finally {
      setWorking(null);
    }
  }

  const nextStatusFor = (current: string) => ({
    CREATED: "CONFIRMED",
    PAYMENT_PENDING: "PAID",
    PAID: "CONFIRMED",
    CONFIRMED: "PACKED",
    // Later stages follow sellers' shipment updates.
  } as Record<string,string>)[current];

  if (error) return <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-black">Order operations</h2>
          <p className="mt-1 text-xs text-slate-500">{filtered.length} of {items.length} orders</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={working === "deadline"} onClick={() => void act(null, "/api/cron/order-deadlines", { method: "POST" }, "")} title="Sends ship-by reminders, marks late orders and auto-cancels orders not shipped within 5 days. Also runs automatically every day." className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-slate-900 disabled:opacity-40">{working === "deadline" ? "Checking…" : "Run deadline check"}</button>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
          <option value="ALL">All statuses</option>
          <option value="LATE">Late to ship</option>
          {["CREATED","PAYMENT_PENDING","PAID","CONFIRMED","PACKED","SHIPPED","OUT_FOR_DELIVERY","DELIVERED","CANCELLED","RETURNED"].map((value) => <option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}
        </select>
        </div>
      </div>
      {actionError ? <p role="alert" className="mx-5 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">{actionError}</p> : null}
      {notice ? <p role="status" className="mx-5 mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800 sm:mx-6">{notice}</p> : null}
      {requests.length ? (
        <div className="mx-5 mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:mx-6">
          <p className="text-sm font-bold text-amber-900">{requests.length} seller cancellation request{requests.length === 1 ? "" : "s"} waiting</p>
          <p className="mt-0.5 text-xs text-amber-800">These orders include items from more than one seller, so one seller can&apos;t cancel them alone. Approve to cancel the whole order and refund the customer, or decline to ask the seller to ship.</p>
          <ul className="mt-3 space-y-2">
            {requests.map((order) => (
              <li key={order.id} className="flex flex-col gap-2 rounded-xl bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm"><b>{order.orderNumber}</b> · {order.sellers.join(", ")}<span className="block text-xs text-slate-500">Reason: {order.cancelRequestReason ?? "—"}</span></span>
                <span className="flex gap-2">
                  <button type="button" disabled={working === order.id} onClick={() => void decide(order, "APPROVE")} className="rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-40">Approve &amp; cancel</button>
                  <button type="button" disabled={working === order.id} onClick={() => void decide(order, "DECLINE")} className="rounded-full border border-slate-300 px-3.5 py-1.5 text-xs font-bold disabled:opacity-40">Decline</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500">No orders match this filter.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map((order) => (
            <article key={order.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-black">{order.orderNumber}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(order.createdAt).toLocaleString("en-IN")} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{order.status.replaceAll("_"," ")}</span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{order.paymentStatus ?? "PENDING"}</span>
                  <ShipBy order={order} />
                  {order.cancelRequestedAt && OPEN.includes(order.status) ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Cancellation requested</span> : null}
                </div>
              </div>
              {order.status === "CANCELLED" && order.cancelledBy ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">Cancelled by <b>{CANCELLED_BY[order.cancelledBy] ?? order.cancelledBy}</b>{order.cancellationReason && !/^cancelled by /i.test(order.cancellationReason) ? ": " + order.cancellationReason : ""}</p> : null}
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Customer</p><p className="mt-1 truncate text-sm font-semibold">{order.customerId}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Sellers</p><p className="mt-1 text-sm font-semibold">{order.sellers.join(", ") || "—"}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Order total</p><p className="mt-1 text-lg font-black">{money(order.grandTotalPaise)}</p></div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {nextStatusFor(order.status) ? <button type="button" disabled={working === order.id} onClick={() => void updateStatus(order, nextStatusFor(order.status)!)} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{working === order.id ? "Updating…" : "Move to " + nextStatusFor(order.status)!.replaceAll("_"," ")}</button> : null}
                {OPEN.includes(order.status) ? <button type="button" disabled={working === order.id} onClick={() => { setCancelling(order); setReason(""); setActionError(""); }} className="rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-40">Cancel order</button> : null}
                <p className="text-xs text-slate-400">{order.discountPaise > 0 ? "Discount " + money(order.discountPaise) : "No discount"}{order.couponCode ? " · Coupon " + order.couponCode : ""}</p>
              </div>
            </article>
          ))}
        </div>
      )}
      {cancelling ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-title" onClick={(e) => { if (e.target === e.currentTarget) setCancelling(null); }}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 id="cancel-title" className="text-lg font-black">Cancel {cancelling.orderNumber}?</h3>
            <p className="mt-1 text-sm text-slate-500">Stock goes back to the sellers, the customer is refunded if they paid, and every seller in the order is alerted. The customer sees the reason.</p>
            <label className="mt-4 block text-sm font-semibold" htmlFor="cancel-reason">Reason</label>
            <textarea id="cancel-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Payment could not be verified" className="mt-1 h-24 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-slate-900" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCancelling(null)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Keep order</button>
              <button type="button" disabled={reason.trim().length < 3 || working === cancelling.id} onClick={() => void confirmCancel()} className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{working === cancelling.id ? "Cancelling…" : "Cancel order"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
