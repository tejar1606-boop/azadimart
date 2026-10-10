"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  sellerSubtotalPaise: number;
  couponCode: string | null;
  createdAt: string;
  productTitle: string;
  sku: string;
  quantity: number;
  unitPricePaise: number;
  paymentStatus: string | null;
  orderItemId: string;
  shipByAt: string | null;
  packedAt: string | null;
  cancelledBy: "CUSTOMER" | "SELLER" | "ADMIN" | "SYSTEM" | null;
  cancellationReason: string | null;
  cancelRequestedAt: string | null;
  cancelRequestReason: string | null;
  cancelRequestedByMe: boolean;
  sharedWithOtherSellers: boolean;
};

const CANCEL_REASONS = ["Out of stock", "Product damaged or defective", "Can't ship to this address", "Price or listing error", "Other"] as const;
const CANCELLED_BY: Record<string, string> = { CUSTOMER: "the customer", SELLER: "you", ADMIN: "AzadiMart", SYSTEM: "AzadiMart (not shipped in time)" };
const shortDate = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** "Ship by" chip: green with time left, amber on the last day, red when late. */
function ShipBy({ iso }: { iso: string }) {
  const left = new Date(iso).getTime() - Date.now();
  const hours = Math.round(left / 3600000);
  const tone = left < 0 ? "bg-red-50 text-red-700 ring-red-200" : hours <= 24 ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-green-50 text-green-700 ring-green-200";
  const text = left < 0 ? `LATE · was due ${shortDate(iso)}` : `Ship by ${shortDate(iso)}${hours <= 24 ? ` · ${Math.max(1, hours)}h left` : ""}`;
  return <span className={"rounded-full px-3 py-1 text-xs font-bold ring-1 " + tone}>{text}</span>;
}

type Shipment = {
  id: string;
  orderId: string;
  status: string;
  providerShipmentId: string | null;
};

const money = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

type Tab = "hold" | "toShip" | "shipped" | "delivered" | "closed" | "all";
const TABS: Array<[Tab, string]> = [["toShip", "To ship"], ["hold", "On hold"], ["shipped", "Shipped"], ["delivered", "Delivered"], ["closed", "Cancelled & returned"], ["all", "All"]];

/** Which tab an order line belongs to (like Meesho: On hold, Pending, Ready to ship, Shipped, Cancelled). */
function bucketOf(item: Order, shipment: Shipment | undefined): Exclude<Tab, "all"> {
  if (item.status === "CANCELLED" || item.status === "RETURNED") return "closed";
  if (item.status === "DELIVERED" || shipment?.status === "DELIVERED") return "delivered";
  if (shipment && !["FAILED", "CANCELLED"].includes(shipment.status)) return "shipped";
  if (["CONFIRMED", "PACKED"].includes(item.status)) return "toShip";
  if (["SHIPPED", "OUT_FOR_DELIVERY"].includes(item.status)) return "shipped";
  return "hold";
}

/** Download the visible orders as a CSV file for Excel or Google Sheets. */
function downloadCsv(rows: Order[]) {
  const head = ["Order number", "Order date", "Product", "SKU", "Quantity", "Unit price (₹)", "Status", "Payment"];
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [r.orderNumber, new Date(r.createdAt).toLocaleString("en-IN"), r.productTitle, r.sku, r.quantity, (r.unitPricePaise / 100).toFixed(2), r.status.replaceAll("_", " "), r.paymentStatus ?? ""].map(cell).join(","));
  const blob = new Blob(["\uFEFF" + [head.map(cell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `azadimart-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const NEXT_SHIPMENT_STATUS: Record<string, string> = {
  CREATED: "PICKED_UP",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};

export default function OrderList() {
  const router = useRouter();
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("toShip");
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState<(typeof CANCEL_REASONS)[number]>("Out of stock");
  const [cancelNote, setCancelNote] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  async function reload() {
    const body = await fetch("/api/v1/orders", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (body?.items) setItems(body.items);
  }

  async function markPacked(item: Order) {
    setWorking(item.id); setActionError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/orders/${item.id}/packed`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not update the order.");
      setNotice(`${item.orderNumber} marked as packed.`);
      await reload();
    } catch (err) { setActionError(err instanceof Error ? err.message : "Could not update the order."); }
    finally { setWorking(null); }
  }

  async function cancelOrder() {
    if (!cancelling) return;
    setWorking(cancelling.id); setActionError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/orders/${cancelling.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: cancelReason, note: cancelNote.trim() || undefined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not cancel the order.");
      setNotice(body.outcome === "REQUESTED" ? `Cancellation requested for ${cancelling.orderNumber}. AzadiMart will review it because the order includes other sellers' items.` : `${cancelling.orderNumber} was cancelled and the stock released.`);
      setCancelling(null); setCancelNote("");
      await reload();
      router.refresh();
    } catch (err) { setActionError(err instanceof Error ? err.message : "Could not cancel the order."); }
    finally { setWorking(null); }
  }
  const [query, setQuery] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/v1/orders", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body?.error?.message ?? "Unable to load orders.");
        }
        setItems(body.items ?? []);

        const shipmentResponse = await fetch("/api/v1/shipments", {
          cache: "no-store",
        });
        const shipmentBody = await shipmentResponse.json();
        if (shipmentResponse.ok) {
          setShipments(shipmentBody.items ?? []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load orders.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function createShipment(orderId: string) {
    setWorking(orderId);
    setError("");
    try {
      const response = await fetch("/api/v1/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Unable to create shipment.");
      }
      setShipments((current) =>
        current.some((item) => item.id === body.shipment.id)
          ? current
          : [body.shipment, ...current],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create shipment.");
    } finally {
      setWorking(null);
    }
  }

  async function updateShipment(shipmentId: string, status: string) {
    setWorking(shipmentId);
    setError("");
    try {
      const response = await fetch("/api/v1/shipments/" + shipmentId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Unable to update shipment.");
      }
      setShipments((current) =>
        current.map((item) =>
          item.id === shipmentId
            ? { ...item, status: body.shipment.status }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update shipment.");
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <div className="mt-7 h-72 animate-pulse rounded-[2rem] bg-white" />;
  }

  if (error) {
    return (
      <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-7 rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="text-xl font-black">No seller orders yet.</p>
        <p className="mt-2 text-sm text-slate-500">
          Orders containing your products will appear here after checkout.
        </p>
      </div>
    );
  }

  const withBucket = items.map((item) => ({ item, bucket: bucketOf(item, shipments.find((entry) => entry.orderId === item.id)) }));
  const counts = Object.fromEntries(TABS.map(([key]) => [key, key === "all" ? items.length : withBucket.filter((x) => x.bucket === key).length])) as Record<Tab, number>;
  const q = query.trim().toLowerCase();
  const shown = withBucket.filter((x) => (tab === "all" || x.bucket === tab) && (!q || x.item.orderNumber.toLowerCase().includes(q) || x.item.sku.toLowerCase().includes(q) || x.item.productTitle.toLowerCase().includes(q))).map((x) => x.item);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div role="tablist" aria-label="Order status" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={"shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition " + (tab === key ? "border-brand text-brand-700" : "border-transparent text-slate-500 hover:text-slate-900")}>
              {label} <span className={"ml-1 rounded-full px-1.5 py-0.5 text-[11px] " + (tab === key ? "bg-brand text-white" : "bg-slate-100 text-slate-500")}>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 pb-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order no., SKU or product" className="h-10 w-full min-w-0 rounded-full border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900 lg:w-64" aria-label="Search orders" />
          <button type="button" onClick={() => downloadCsv(shown)} disabled={!shown.length} className="shrink-0 rounded-full bg-chrome px-4 text-xs font-semibold text-white disabled:opacity-40">Download</button>
        </div>
      </div>
      {notice ? <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</p> : null}
      {actionError ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p> : null}
      {cancelling ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lift">
            <h2 id="cancel-title" className="text-lg font-semibold">{cancelling.sharedWithOtherSellers ? "Request cancellation" : "Cancel order"} {cancelling.orderNumber}?</h2>
            <p className="mt-1 text-sm text-slate-500">{cancelling.sharedWithOtherSellers ? "This order also has other sellers' items, so AzadiMart will review your request." : "The customer is told the reason and the stock is released. Cancellations lower your seller rating, so use this only when you really can't ship."}</p>
            <fieldset className="mt-4 space-y-2">
              <legend className="text-sm font-medium">Reason</legend>
              {CANCEL_REASONS.map((r) => <label key={r} className="flex items-center gap-2 text-sm"><input type="radio" name="cancel-reason" checked={cancelReason === r} onChange={() => setCancelReason(r)} />{r}</label>)}
            </fieldset>
            <label className="mt-3 block text-sm font-medium">Note (optional)
              <input value={cancelNote} maxLength={300} onChange={(e) => setCancelNote(e.target.value)} placeholder="e.g. new stock arrives next week" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setCancelling(null)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Keep order</button>
              <button type="button" disabled={working === cancelling.id} onClick={() => void cancelOrder()} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{working === cancelling.id ? "Working…" : cancelling.sharedWithOtherSellers ? "Send request" : "Cancel order"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {shown.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-semibold">{q ? "No orders match your search." : tab === "toShip" ? "Nothing to ship right now 🎉" : "No orders here."}</p>
          <p className="mt-1 text-sm text-slate-500">{tab === "toShip" && !q ? "New orders appear here as soon as customers buy your products." : "Try another tab."}</p>
        </div>
      ) : (
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="divide-y divide-slate-100">
        {shown.map((item) => {
          const shipment = shipments.find((entry) => entry.orderId === item.id);
          const nextStatus = shipment
            ? NEXT_SHIPMENT_STATUS[shipment.status] ?? null
            : null;

          return (
            <article key={item.orderItemId} className="p-5 sm:p-7">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-black">{item.orderNumber}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["CONFIRMED", "PACKED"].includes(item.status) && !shipment && item.shipByAt ? <ShipBy iso={item.shipByAt} /> : null}
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                    {item.status.replaceAll("_", " ")}
                  </span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                    {item.paymentStatus ?? "PENDING"}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <p className="text-sm font-black">{item.productTitle}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    SKU {item.sku} · Qty {item.quantity}
                  </p>
                </div>
                <p className="text-sm text-slate-500">
                  {money(item.unitPricePaise)} each
                </p>
                <p className="text-lg font-black">
                  {money(item.unitPricePaise * item.quantity)}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">
                  {item.couponCode
                    ? "Customer used coupon " + item.couponCode
                    : "No coupon"}{" "}
                  · Your items {money(item.sellerSubtotalPaise)}
                </span>

                {shipment ? (
                  <>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                      Shipment: {shipment.status.replaceAll("_", " ")}
                    </span>
                    {nextStatus ? (
                      <button
                        type="button"
                        disabled={working === shipment.id}
                        onClick={() => void updateShipment(shipment.id, nextStatus)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
                      >
                        {working === shipment.id
                          ? "Updating…"
                          : "Mark " + nextStatus.replaceAll("_", " ").toLowerCase()}
                      </button>
                    ) : null}
                    {["FAILED", "CANCELLED"].includes(shipment.status) && ["CONFIRMED", "PACKED"].includes(item.status) ? (
                      <button
                        type="button"
                        disabled={working === item.id}
                        onClick={() => void createShipment(item.id)}
                        className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {working === item.id ? "Retrying…" : "Retry shipment"}
                      </button>
                    ) : null}
                  </>
                ) : ["CONFIRMED", "PACKED"].includes(item.status) ? (
                  <>
                    {item.status === "CONFIRMED" && !item.sharedWithOtherSellers ? (
                      <button type="button" disabled={working === item.id} onClick={() => void markPacked(item)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-slate-900 disabled:opacity-50">Mark as packed</button>
                    ) : null}
                    <button
                      type="button"
                      disabled={working === item.id}
                      onClick={() => void createShipment(item.id)}
                      className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {working === item.id ? "Creating…" : "Create shipment"}
                    </button>
                    {item.cancelRequestedByMe ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">Cancellation requested · awaiting AzadiMart</span>
                    ) : (
                      <button type="button" disabled={working === item.id} onClick={() => { setCancelling(item); setCancelReason("Out of stock"); setCancelNote(""); }} className="rounded-full px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
                        {item.sharedWithOtherSellers ? "Request cancellation" : "Cancel order"}
                      </button>
                    )}
                  </>
                ) : null}
              </div>
              {item.status === "CANCELLED" && item.cancelledBy ? (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">Cancelled by <b>{CANCELLED_BY[item.cancelledBy]}</b>{item.cancellationReason ? ` · ${item.cancellationReason}` : ""}</p>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
      )}
    </div>
  );
}
