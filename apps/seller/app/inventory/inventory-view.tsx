"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Item = { id: string; title: string; status: string; coverImageUrl: string | null; pricePaise: number | null; available: number };
const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const FILTERS = [["all", "All"], ["low", "Low stock (≤ 5)"], ["out", "Out of stock"]] as const;

export default function InventoryView() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/products", { cache: "no-store" })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.message ?? "Could not load stock"); setItems((b.products ?? []).filter((p: Item) => p.status !== "ARCHIVED")); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => items.filter((item) => (filter === "low" ? item.available > 0 && item.available <= 5 : filter === "out" ? item.available === 0 : true)).sort((a, b) => a.available - b.available), [items, filter]);
  const totals = { units: items.reduce((s, i) => s + i.available, 0), low: items.filter((i) => i.available > 0 && i.available <= 5).length, out: items.filter((i) => i.available === 0).length };

  return (
    <>
      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        {[["Units available", totals.units.toLocaleString("en-IN"), "text-slate-950"], ["Low stock", String(totals.low), "text-amber-700"], ["Out of stock", String(totals.out), "text-red-600"]].map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5"><p className="text-[13px] font-medium text-slate-500">{label}</p><p className={"mt-1 text-2xl font-semibold " + tone}>{value}</p></div>
        ))}
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={"rounded-full px-3.5 py-1.5 text-xs font-semibold " + (filter === key ? "bg-chrome text-white" : "bg-panel text-slate-600 hover:text-slate-900")}>{label}</button>
          ))}
        </div>
        {error ? <p className="p-5 text-sm text-red-600">{error}</p> : loading ? <p className="p-5 text-sm text-slate-500">Loading stock…</p> : shown.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Nothing here.</p> : (
          <ul className="divide-y divide-slate-100">
            {shown.map((item) => (
              <li key={item.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                <div className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-slate-100 bg-cover bg-center" style={item.coverImageUrl ? { backgroundImage: `url("${item.coverImageUrl}")` } : undefined} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-slate-500">{item.pricePaise !== null ? money(item.pricePaise) : "No price"} · {item.status.replaceAll("_", " ").toLowerCase()}</p></div>
                <span className={"shrink-0 rounded-full px-3 py-1 text-xs font-semibold " + (item.available === 0 ? "bg-red-50 text-red-700" : item.available <= 5 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700")}>{item.available === 0 ? "Out of stock" : `${item.available} available`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-500">Available = on hand minus units reserved for open orders. To restock, edit the product or <Link href="/products/new" className="font-semibold text-brand-600">create a new one</Link>.</p>
    </>
  );
}
