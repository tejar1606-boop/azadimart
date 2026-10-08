"use client";

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
};

type Shipment = {
  id: string;
  orderId: string;
  status: string;
  providerShipmentId: string | null;
};

const money = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const NEXT_SHIPMENT_STATUS: Record<string, string> = {
  CREATED: "PICKED_UP",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};

export default function OrderList() {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [working, setWorking] = useState<string | null>(null);

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

  return (
    <div className="mt-7 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-100">
        {items.map((item) => {
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
                  <button
                    type="button"
                    disabled={working === item.id}
                    onClick={() => void createShipment(item.id)}
                    className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {working === item.id ? "Creating…" : "Create shipment"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
