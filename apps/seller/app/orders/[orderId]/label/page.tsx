"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Barcode from "./barcode";

type Addr = { name: string; line1: string; line2: string | null; city: string; state: string; postalCode: string };
type Label = {
  orderNumber: string; orderedAt: string; shipTo: Addr;
  shipFrom: (Addr & { phone: string; storeName: string; gstin: string | null }) | null;
  items: Array<{ title: string; variant: string | null; sku: string; quantity: number; unitPricePaise: number }>;
  weightGrams: number; payment: { mode: "COD" | "PREPAID"; collectPaise: number };
  shipment: { courierName: string | null; awb: string | null; status: string; shippedBy: string } | null;
};

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Printable shipping label (stick on the parcel) and packing slip (put inside). */
export default function ShippingLabelPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [label, setLabel] = useState<Label | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/v1/orders/${orderId}/label`, { cache: "no-store" }).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message ?? "Couldn't load the label.");
      setLabel(body);
    }).catch((e) => setError(e.message));
  }, [orderId]);

  if (error) return <main className="px-4 py-8 sm:px-10"><a href="/orders" className="text-sm font-semibold text-slate-500">← Orders</a><p className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p></main>;
  if (!label) return <main className="px-4 py-8 sm:px-10"><div className="h-96 animate-pulse rounded-2xl bg-white" /></main>;

  const qty = label.items.reduce((n, i) => n + i.quantity, 0);
  const addr = (a: Addr) => [a.line1, a.line2].filter(Boolean).join(", ");

  return (
    <main className="px-4 py-6 sm:px-10 sm:py-8">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #print-area, #print-area * { visibility: visible !important; }
        #print-area { position: absolute; left: 0; top: 0; width: 100%; }
        @page { size: A4; margin: 10mm; }
      }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <a href="/orders" className="text-sm font-semibold text-slate-500 hover:text-slate-900">← Orders</a>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Shipping label · {label.orderNumber}</h1>
          <p className="mt-1 text-sm text-slate-500">Print, stick the label on the parcel and put the packing slip inside.</p>
        </div>
        <button type="button" onClick={() => window.print()} className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white">Print label</button>
      </div>
      {!label.shipFrom ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 print:hidden">Add your pickup address in <a href="/shipping" className="font-bold underline">Shipping &amp; pickup</a> so it prints as the return address.</p> : null}

      <div id="print-area" className="mt-6 space-y-6 text-slate-950">
        {/* Shipping label */}
        <section className="mx-auto max-w-[720px] rounded-lg border-2 border-slate-950 bg-white">
          <div className="flex items-center justify-between border-b-2 border-slate-950 px-4 py-2.5">
            <p className="text-lg font-black tracking-tight">loimart</p>
            <p className={"rounded px-3 py-1 text-base font-black " + (label.payment.mode === "COD" ? "bg-slate-950 text-white" : "border-2 border-slate-950")}>
              {label.payment.mode === "COD" ? `COD · COLLECT ${money(label.payment.collectPaise)}` : "PREPAID · DO NOT COLLECT"}
            </p>
          </div>
          <div className="grid sm:grid-cols-[1.4fr_1fr] print:grid-cols-[1.4fr_1fr]">
            <div className="border-b-2 border-slate-950 p-4 sm:border-b-0 sm:border-r-2 print:border-b-0 print:border-r-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Deliver to</p>
              <p className="mt-1 text-xl font-black">{label.shipTo.name}</p>
              <p className="mt-1 text-[15px] leading-6">{addr(label.shipTo)}</p>
              <p className="text-[15px] leading-6">{label.shipTo.city}, {label.shipTo.state}</p>
              <p className="mt-1 text-3xl font-black tracking-wider">PIN {label.shipTo.postalCode}</p>
            </div>
            <div className="p-4 text-sm">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Order</p>
              <p className="mt-1 break-all text-lg font-black">{label.orderNumber}</p>
              <p className="text-xs text-slate-600">{new Date(label.orderedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500">Items</dt><dd className="font-bold">{qty}</dd>
                <dt className="text-slate-500">Weight</dt><dd className="font-bold">{label.weightGrams >= 1000 ? (label.weightGrams / 1000).toFixed(2) + " kg" : label.weightGrams + " g"}</dd>
                {label.shipment?.courierName ? <><dt className="text-slate-500">Courier</dt><dd className="font-bold">{label.shipment.courierName}</dd></> : null}
                {label.shipment?.awb ? <><dt className="text-slate-500">AWB</dt><dd className="break-all font-bold">{label.shipment.awb}</dd></> : null}
              </dl>
            </div>
          </div>
          {label.shipment?.awb ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-slate-950 px-4 py-3">
              <div className="min-w-[220px] flex-1"><Barcode value={label.shipment.awb} /><p className="mt-1 font-mono text-sm font-bold tracking-widest">{label.shipment.awb}</p></div>
              <p className="text-right text-xs"><span className="block font-black">{label.shipment.courierName}</span>{label.shipment.shippedBy === "LOIMART" ? <span className="text-slate-600">Booked by LOIMART · pickup from seller</span> : null}</p>
            </div>
          ) : null}
          <div className="border-t-2 border-slate-950 px-4 py-3 text-xs">
            <p className="font-bold uppercase tracking-widest text-slate-500">If undelivered, return to</p>
            {label.shipFrom ? <p className="mt-1 leading-5"><b>{label.shipFrom.storeName}</b> ({label.shipFrom.name}), {addr(label.shipFrom)}, {label.shipFrom.city}, {label.shipFrom.state} {label.shipFrom.postalCode} · 📞 {label.shipFrom.phone}{label.shipFrom.gstin ? ` · GSTIN ${label.shipFrom.gstin}` : ""}</p> : <p className="mt-1 text-amber-700">Pickup address not set</p>}
          </div>
        </section>

        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-slate-400">✂ cut here · packing slip goes inside the parcel</p>

        {/* Packing slip */}
        <section className="mx-auto max-w-[720px] rounded-lg border border-slate-300 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="text-lg font-black">Packing slip</p><p className="text-xs text-slate-500">Order {label.orderNumber} · {label.shipFrom?.storeName ?? ""}</p></div>
            <p className="text-xs text-slate-500">Thank you for shopping on loimart!</p>
          </div>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-slate-300 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="py-2">Item</th><th>SKU</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="w-10 text-center">✓</th></tr></thead>
            <tbody>
              {label.items.map((i, n) => (
                <tr key={n} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-2"><p className="font-semibold">{i.title}</p>{i.variant ? <p className="text-xs text-slate-500">{i.variant}</p> : null}</td>
                  <td className="pr-2 text-xs">{i.sku}</td>
                  <td className="text-right font-bold">{i.quantity}</td>
                  <td className="text-right">{money(i.unitPricePaise * i.quantity)}</td>
                  <td className="text-center"><span className="inline-block h-4 w-4 border border-slate-400" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">Seller: tick each item as you pack it. Customer: easy 7-day returns from My orders on loimart.</p>
        </section>
      </div>
    </main>
  );
}
