"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Order = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  deliverTo: string | null;
  deliveryPhone: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  status: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  grandTotalPaise: number;
  couponCode: string | null;
  createdAt: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  sellerCount: number;
  sellers: string[];
  itemCount: number;
  firstItem: string | null;
  shipByAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  cancelRequestedAt: string | null;
  cancelRequestReason: string | null;
};
type Request = { id: string; orderNumber: string; cancelRequestReason: string | null; sellers: string[] };
type Result = { items: Order[]; total: number; page: number; pages: number; counts: Record<string, number>; requests: Request[] };

const CANCELLED_BY: Record<string, string> = { CUSTOMER: "the customer", SELLER: "the seller", ADMIN: "AzadiMart", SYSTEM: "AzadiMart (not shipped in time)" };
const OPEN = ["CREATED", "PAYMENT_PENDING", "PAID", "CONFIRMED", "PACKED"];
const TABS: Array<[string, string]> = [["ALL", "All"], ["LATE", "Late to ship"], ["CONFIRMED", "To pack"], ["PACKED", "Packed"], ["SHIPPED", "Shipped"], ["OUT_FOR_DELIVERY", "Out for delivery"], ["DELIVERED", "Delivered"], ["CANCELLED", "Cancelled"], ["RETURNED", "Returned"]];
const MORE_STATUSES: Array<[string, string]> = [["CREATED", "Created"], ["PAYMENT_PENDING", "Payment pending"], ["PAID", "Paid"]];
const STATUS_TONE: Record<string, string> = { CONFIRMED: "bg-sky-50 text-sky-700", PACKED: "bg-sky-50 text-sky-700", SHIPPED: "bg-indigo-50 text-indigo-700", OUT_FOR_DELIVERY: "bg-indigo-50 text-indigo-700", DELIVERED: "bg-green-50 text-green-700", CANCELLED: "bg-slate-100 text-slate-500", RETURNED: "bg-amber-50 text-amber-700" };
const PAY_TONE: Record<string, string> = { CAPTURED: "bg-green-50 text-green-700", AUTHORIZED: "bg-green-50 text-green-700", FAILED: "bg-red-50 text-red-700", REFUNDED: "bg-slate-100 text-slate-600", PARTIALLY_REFUNDED: "bg-slate-100 text-slate-600" };
const words = (v: string) => v.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** "2026-10-11" for a day N days ago in India time. */
const istDay = (daysAgo = 0) => new Date(Date.now() + 330 * 60_000 - daysAgo * 864e5).toISOString().slice(0, 10);
const RANGES: Array<[string, string]> = [["", "Any time"], ["today", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["custom", "Custom dates"]];

/** "Ship by 12 Oct" chip, red and "LATE" once the date has passed on an unshipped order. */
function ShipBy({ order }: { order: Order }) {
  if (!order.shipByAt || !OPEN.includes(order.status)) return null;
  const late = new Date(order.shipByAt).getTime() < Date.now();
  const date = new Date(order.shipByAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return <span className={"rounded-full px-3 py-1 text-xs font-bold " + (late ? "bg-red-600 text-white" : "bg-sky-50 text-sky-700")}>{late ? "LATE · was due " + date : "Ship by " + date}</span>;
}

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function OrdersList() {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [payment, setPayment] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [range, setRange] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // A link like /orders?q=AZM-… opens with that search.
  useEffect(() => { const initial = new URLSearchParams(window.location.search).get("q"); if (initial) { setQuery(initial); setQ(initial); } }, []);
  useEffect(() => { const t = setTimeout(() => { setQ(query.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [query]);
  // "/" focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const params = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "ALL") p.set("status", status);
    if (payment) p.set("payment", payment);
    if (paymentStatus) p.set("paymentStatus", paymentStatus);
    const span = range === "today" ? [istDay(), istDay()] : range === "7" ? [istDay(6), istDay()] : range === "30" ? [istDay(29), istDay()] : range === "custom" ? [from, to] : ["", ""];
    if (span[0]) p.set("from", span[0]);
    if (span[1]) p.set("to", span[1]);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p;
  }, [q, status, payment, paymentStatus, range, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/orders?${params({ page: String(page) })}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to load orders.");
      setData(body);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }, [params, page]);
  useEffect(() => { void load(); }, [load]);

  async function act(order: { id: string } | null, path: string, init: RequestInit, done: string) {
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
  const decide = (order: Request, decision: "APPROVE" | "DECLINE") =>
    act(order, `/api/v1/orders/${order.id}/cancel-request`, { method: "POST", body: JSON.stringify({ decision }) }, decision === "APPROVE" ? `${order.orderNumber} cancelled and the customer refunded.` : `Request declined; the seller has been told to ship ${order.orderNumber}.`);
  async function confirmCancel() {
    if (!cancelling || reason.trim().length < 3) return;
    const ok = await act(cancelling, "/api/v1/orders/" + cancelling.id, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED", notes: reason.trim() }) }, `${cancelling.orderNumber} cancelled.`);
    if (ok) { setCancelling(null); setReason(""); }
  }
  const nextStatusFor = (current: string) => ({ CREATED: "CONFIRMED", PAYMENT_PENDING: "PAID", PAID: "CONFIRMED", CONFIRMED: "PACKED" } as Record<string, string>)[current];
  const updateStatus = (order: Order, nextStatus: string) => act(order, "/api/v1/orders/" + order.id, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) }, `${order.orderNumber} moved to ${words(nextStatus).toLowerCase()}.`);

  const filtersOn = Boolean(q || payment || paymentStatus || range || status !== "ALL");
  const clear = () => { setQuery(""); setQ(""); setStatus("ALL"); setPayment(""); setPaymentStatus(""); setRange(""); setFrom(""); setTo(""); setPage(1); };
  const counts = data?.counts ?? {};
  const items = data?.items ?? [];

  return (
    <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
        <div className="flex flex-col gap-2 lg:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search orders</span>
            <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Search orders: number, customer, phone, seller, product…" title="Order number, customer name, email or phone, seller, product name, SKU or coupon code"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-10 text-sm outline-none focus:border-slate-900" />
            {!query ? <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 px-1.5 text-[11px] text-slate-400 sm:block">/</kbd> : null}
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select value={range} onChange={(e) => { setRange(e.target.value); setPage(1); }} aria-label="Date" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={payment} onChange={(e) => { setPayment(e.target.value); setPage(1); }} aria-label="Payment method" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="">COD &amp; online</option><option value="COD">Cash on Delivery</option><option value="ONLINE">Paid online</option>
            </select>
            <select value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }} aria-label="Payment status" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="">Any payment status</option>
              {["PENDING", "CAPTURED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"].map((s) => <option key={s} value={s}>{words(s)}</option>)}
            </select>
            <a href={`/api/v1/orders?${params({ format: "csv" })}`} className="flex items-center justify-center rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold hover:border-slate-900" title="Download the orders matching these filters (up to 5,000)">Export CSV</a>
          </div>
        </div>
        {range === "custom" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">From<input type="date" value={from} max={to || istDay()} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="rounded-xl border border-slate-300 px-3 py-2" /></label>
            <label className="flex items-center gap-2">To<input type="date" value={to} min={from} max={istDay()} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="rounded-xl border border-slate-300 px-3 py-2" /></label>
          </div>
        ) : null}
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Order status">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={status === key} onClick={() => { setStatus(key); setPage(1); }}
              className={"flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition " + (status === key ? (key === "LATE" ? "bg-red-600 text-white" : "bg-slate-950 text-white") : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
              {label}<span className={"text-xs " + (status === key ? "text-white/70" : key === "LATE" && counts.LATE ? "font-bold text-red-600" : "text-slate-400")}>{counts[key] ?? 0}</span>
            </button>
          ))}
          <select value={MORE_STATUSES.some(([k]) => k === status) ? status : ""} onChange={(e) => { if (e.target.value) { setStatus(e.target.value); setPage(1); } }} aria-label="More statuses" className="shrink-0 rounded-full border-0 bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
            <option value="">More…</option>
            {MORE_STATUSES.map(([k, l]) => <option key={k} value={k}>{l} ({counts[k] ?? 0})</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            {loading && !data ? "Loading…" : `${(data?.total ?? 0).toLocaleString("en-IN")} order${data?.total === 1 ? "" : "s"}${filtersOn ? (data?.total === 1 ? " matches" : " match") : ""}`}
            {filtersOn ? <button type="button" onClick={clear} className="ml-3 font-semibold text-brand-700 hover:underline">Clear filters</button> : null}
          </p>
          <button type="button" disabled={working === "deadline"} onClick={() => void act(null, "/api/cron/order-deadlines", { method: "POST" }, "")} title="Sends ship-by reminders, marks late orders and auto-cancels orders not shipped within 5 days. Also runs automatically every day." className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:border-slate-900 disabled:opacity-40">{working === "deadline" ? "Checking…" : "Run deadline check"}</button>
        </div>
      </div>

      {error ? <p role="alert" className="mx-5 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">{error}</p> : null}
      {actionError ? <p role="alert" className="mx-5 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">{actionError}</p> : null}
      {notice ? <p role="status" className="mx-5 mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800 sm:mx-6">{notice}</p> : null}
      {data?.requests.length ? (
        <div className="mx-5 mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:mx-6">
          <p className="text-sm font-bold text-amber-900">{data.requests.length} seller cancellation request{data.requests.length === 1 ? "" : "s"} waiting</p>
          <p className="mt-0.5 text-xs text-amber-800">These orders include items from more than one seller, so one seller can&apos;t cancel them alone. Approve to cancel the whole order and refund the customer, or decline to ask the seller to ship.</p>
          <ul className="mt-3 space-y-2">
            {data.requests.map((order) => (
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

      {loading && !data ? <div className="m-5 h-72 animate-pulse rounded-2xl bg-slate-50" /> : null}
      {data && !items.length ? (
        <div className="p-12 text-center">
          <p className="font-semibold">No orders found</p>
          <p className="mt-1 text-sm text-slate-500">{q ? <>Nothing matches “{q}”. Check the spelling, or search part of the order number or phone.</> : "No orders match these filters."}</p>
          {filtersOn ? <button type="button" onClick={clear} className="mt-4 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:border-slate-900">Clear filters</button> : null}
        </div>
      ) : null}

      <div className={"divide-y divide-slate-100 transition-opacity " + (loading && data ? "opacity-60" : "")}>
        {items.map((order) => (
          <article key={order.id} className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="font-black">{order.orderNumber}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}{order.firstItem ? ` · ${order.firstItem}${order.itemCount > 1 ? " and more" : ""}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={"rounded-full px-3 py-1 text-xs font-bold " + (STATUS_TONE[order.status] ?? "bg-slate-100 text-slate-700")}>{words(order.status)}</span>
                <span className={"rounded-full px-3 py-1 text-xs font-bold " + (PAY_TONE[order.paymentStatus ?? ""] ?? "bg-amber-50 text-amber-700")}>{order.paymentMethod === "COD" ? "COD" : order.paymentMethod ? "Online" : "Payment"} · {words(order.paymentStatus ?? "PENDING")}</span>
                <ShipBy order={order} />
                {order.cancelRequestedAt && OPEN.includes(order.status) ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Cancellation requested</span> : null}
              </div>
            </div>
            {order.status === "CANCELLED" && order.cancelledBy ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">Cancelled by <b>{CANCELLED_BY[order.cancelledBy] ?? order.cancelledBy}</b>{order.cancellationReason && !/^cancelled by /i.test(order.cancellationReason) ? ": " + order.cancellationReason : ""}</p> : null}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="min-w-0 rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-400">Customer</p>
                <p className="mt-1 truncate text-sm font-semibold">{order.customerName ?? order.deliverTo ?? "—"}</p>
                <p className="truncate text-xs text-slate-500">{[order.deliveryPhone ?? order.customerPhone, order.customerEmail].filter(Boolean).join(" · ") || "—"}</p>
                {order.city ? <p className="truncate text-xs text-slate-500">{[order.city, order.state, order.postalCode].filter(Boolean).join(", ")}</p> : null}
              </div>
              <div className="min-w-0 rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Seller{order.sellerCount === 1 ? "" : "s"}</p><p className="mt-1 text-sm font-semibold">{order.sellers.join(", ") || "—"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Order total</p><p className="mt-1 text-lg font-black">{money(order.grandTotalPaise)}</p><p className="text-xs text-slate-500">{order.discountPaise > 0 ? "Discount " + money(order.discountPaise) : "No discount"}{order.couponCode ? " · " + order.couponCode : ""}</p></div>
            </div>
            {nextStatusFor(order.status) || OPEN.includes(order.status) ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {nextStatusFor(order.status) ? <button type="button" disabled={working === order.id} onClick={() => void updateStatus(order, nextStatusFor(order.status)!)} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{working === order.id ? "Updating…" : "Move to " + words(nextStatusFor(order.status)!).toLowerCase()}</button> : null}
                {OPEN.includes(order.status) ? <button type="button" disabled={working === order.id} onClick={() => { setCancelling(order); setReason(""); setActionError(""); }} className="rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-40">Cancel order</button> : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {data && data.pages > 1 ? (
        <nav className="flex items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm sm:px-6" aria-label="Pages">
          <button type="button" disabled={page <= 1 || loading} onClick={() => { setPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full border border-slate-300 px-4 py-2 font-semibold disabled:opacity-40">← Newer</button>
          <span className="text-slate-500">Page {data.page} of {data.pages}</span>
          <button type="button" disabled={page >= data.pages || loading} onClick={() => { setPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full border border-slate-300 px-4 py-2 font-semibold disabled:opacity-40">Older →</button>
        </nav>
      ) : null}

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
