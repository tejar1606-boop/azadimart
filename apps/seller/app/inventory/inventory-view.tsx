"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Item = { variantId: string; productId: string; sku: string; title: string; variant: string; status: string; pricePaise: number; onHand: number; reserved: number };
const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const FILTERS = [["all", "All"], ["low", "Low stock (≤ 5)"], ["out", "Out of stock"]] as const;
type Filter = (typeof FILTERS)[number][0];
const available = (i: Item) => Math.max(0, i.onHand - i.reserved);

/** One SKU's stock, with an inline "Update stock" editor. */
function StockRow({ item, onSaved }: { item: Item; onSaved: (next: Item) => void }) {
  const left = available(item);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/v1/products/stock", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId: item.variantId, available: Number(value) }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.details?.[0]?.message ?? b?.error?.message ?? "Couldn't update stock");
      onSaved({ ...item, onHand: b.onHand, reserved: b.reserved });
      setEditing(false);
      setMsg({ ok: true, text: b.available > 0 ? `Updated: ${b.available} ready to sell` : "Updated: marked out of stock" });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't update stock" }); }
    finally { setBusy(false); }
  }

  return (
    <li className={"px-4 py-3 sm:px-5 " + (left === 0 ? "bg-red-50/40" : "")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/products/${item.productId}`} className="block truncate text-sm font-medium hover:underline">{item.title}</Link>
          <p className="text-xs text-slate-500">{item.variant} · SKU {item.sku} · {money(item.pricePaise)} · {item.status.replaceAll("_", " ").toLowerCase()}{item.reserved ? ` · ${item.reserved} held for open orders` : ""}</p>
        </div>
        <span className={"shrink-0 rounded-full px-3 py-1 text-xs font-semibold " + (left === 0 ? "bg-red-50 text-red-700" : left <= 5 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700")}>{left === 0 ? "Out of stock" : `${left} available`}</span>
        {!editing ? (
          <button type="button" onClick={() => { setEditing(true); setValue(String(left)); setMsg(null); }} className={"shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold " + (left === 0 ? "bg-chrome text-white" : "ring-1 ring-slate-300 hover:ring-slate-900")}>Update stock</button>
        ) : null}
      </div>
      {editing ? (
        <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-600">Units ready to sell
            <input autoFocus type="number" min={0} max={100000} step={1} required value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </label>
          <button disabled={busy || value === ""} className="rounded-full bg-chrome px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
          <button type="button" onClick={() => setEditing(false)} className="px-2 py-2 text-xs font-semibold text-slate-500">Cancel</button>
          {item.reserved ? <p className="w-full text-[11px] text-slate-500">Don&apos;t count the {item.reserved} unit{item.reserved === 1 ? "" : "s"} already held for open orders; they stay reserved.</p> : null}
        </form>
      ) : null}
      {msg ? <p className={"mt-2 text-xs " + (msg.ok ? "text-green-700" : "text-red-600")}>{msg.text}</p> : null}
    </li>
  );
}

export default function InventoryView() {
  const params = useSearchParams();
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<Filter>(() => (FILTERS.some(([k]) => k === params.get("filter")) ? (params.get("filter") as Filter) : "all"));
  const [q, setQ] = useState(params.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/products/stock", { cache: "no-store" })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.message ?? "Could not load stock"); setItems(b.items ?? []); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Sorted once on load (out of stock first), so a row doesn't jump away after it's updated.
  const order = useMemo(() => new Map([...items].sort((a, b) => available(a) - available(b)).map((i, n) => [i.variantId, n])), [items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => items
    .filter((i) => (filter === "low" ? available(i) > 0 && available(i) <= 5 : filter === "out" ? available(i) === 0 : true))
    .filter((i) => !needle || i.title.toLowerCase().includes(needle) || i.sku.toLowerCase().includes(needle))
    .sort((a, b) => (order.get(a.variantId) ?? 0) - (order.get(b.variantId) ?? 0)), [items, filter, needle, order]);
  const totals = { units: items.reduce((s, i) => s + available(i), 0), low: items.filter((i) => available(i) > 0 && available(i) <= 5).length, out: items.filter((i) => available(i) === 0).length };
  const saved = (next: Item) => setItems((all) => all.map((i) => (i.variantId === next.variantId ? next : i)));

  return (
    <>
      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        {[["Units available", totals.units.toLocaleString("en-IN"), "text-slate-950"], ["Low stock", String(totals.low), "text-amber-700"], ["Out of stock", String(totals.out), "text-red-600"]].map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5"><p className="text-[13px] font-medium text-slate-500">{label}</p><p className={"mt-1 text-2xl font-semibold " + tone}>{value}</p></div>
        ))}
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={"rounded-full px-3.5 py-1.5 text-xs font-semibold " + (filter === key ? "bg-chrome text-white" : "bg-panel text-slate-600 hover:text-slate-900")}>{label}{key === "out" && totals.out ? ` (${totals.out})` : ""}</button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or SKU" className="ml-auto w-full rounded-full border border-slate-300 px-4 py-1.5 text-sm outline-none focus:border-slate-900 sm:w-64" />
        </div>
        {error ? <p className="p-5 text-sm text-red-600">{error}</p> : loading ? <p className="p-5 text-sm text-slate-500">Loading stock…</p> : shown.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Nothing here.</p> : (
          <ul className="divide-y divide-slate-100">
            {shown.map((item) => <StockRow key={item.variantId} item={item} onSaved={saved} />)}
          </ul>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-500">Available = units ready to sell, not counting units held for open orders. Stock changes apply straight away (no QC). To update many SKUs at once, use <Link href="/products/bulk" className="font-semibold text-brand-600">bulk upload</Link>.</p>
    </>
  );
}
