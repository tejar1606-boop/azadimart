"use client";

import { useEffect, useMemo, useState } from "react";

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
};

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function OrdersList() {
  const [items, setItems] = useState<Order[]>([]);
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
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
    })();
  }, []);

  const filtered = useMemo(
    () => status === "ALL" ? items : items.filter((order) => order.status === status),
    [items, status],
  );

  if (loading) return <div className="mt-7 h-96 animate-pulse rounded-3xl bg-white" />;
  async function updateStatus(order: Order, nextStatus: string) {
    setWorking(order.id); setError("");
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
      setError(err instanceof Error ? err.message : "Unable to update order.");
    } finally {
      setWorking(null);
    }
  }

  const nextStatusFor = (current: string) => ({
    CREATED: "CONFIRMED",
    PAYMENT_PENDING: "PAID",
    PAID: "CONFIRMED",
    CONFIRMED: "PACKED",
    PACKED: "SHIPPED",
    SHIPPED: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED",
  } as Record<string,string>)[current];

  if (error) return <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-black">Order operations</h2>
          <p className="mt-1 text-xs text-slate-500">{filtered.length} of {items.length} orders</p>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
          <option value="ALL">All statuses</option>
          {["CREATED","PAYMENT_PENDING","PAID","CONFIRMED","PACKED","SHIPPED","OUT_FOR_DELIVERY","DELIVERED","CANCELLED","RETURNED"].map((value) => <option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}
        </select>
      </div>
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
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Customer</p><p className="mt-1 truncate text-sm font-semibold">{order.customerId}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Sellers</p><p className="mt-1 text-sm font-semibold">{order.sellers.join(", ") || "—"}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Order total</p><p className="mt-1 text-lg font-black">{money(order.grandTotalPaise)}</p></div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {nextStatusFor(order.status) ? <button type="button" disabled={working === order.id} onClick={() => void updateStatus(order, nextStatusFor(order.status)!)} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{working === order.id ? "Updating…" : "Move to " + nextStatusFor(order.status)!.replaceAll("_"," ")}</button> : null}
                {["CREATED","PAYMENT_PENDING","PAID","CONFIRMED"].includes(order.status) ? <button type="button" disabled={working === order.id} onClick={() => void updateStatus(order, "CANCELLED")} className="rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-40">Cancel order</button> : null}
                <p className="text-xs text-slate-400">{order.discountPaise > 0 ? "Discount " + money(order.discountPaise) : "No discount"}{order.couponCode ? " · Coupon " + order.couponCode : ""}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
