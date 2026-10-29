"use client";
/* eslint-disable @next/next/no-img-element -- small admin thumbnails from our own media */

import { useEffect, useState } from "react";

type Item = { id: string; title: string; status: string; storeName: string; coverImageUrl: string | null; pricePaise: number | null };
const money = (p: number | null) => (p == null ? "" : "₹" + (p / 100).toLocaleString("en-IN"));

/**
 * Choose the products shown in "More to explore" on this product's page.
 * Saved on its own; empty spots are filled automatically on the store.
 */
export default function RelatedProducts({ productId, className }: { productId: string; className: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [max, setMax] = useState(8);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void fetch(`/api/v1/catalog/products/${productId}/related`, { cache: "no-store" }).then((r) => r.json()).then((b) => { setItems(b.items ?? []); if (b.max) setMax(b.max); }).catch(() => setItems([]));
  }, [productId]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      void fetch(`/api/v1/catalog/products?status=LIVE&q=${encodeURIComponent(q)}`, { cache: "no-store" }).then((r) => r.json())
        .then((b) => setResults(((b.items ?? []) as Array<Item & { sellerName?: string }>).map((p) => ({ ...p, storeName: p.storeName ?? p.sellerName ?? "" })).filter((p) => p.id !== productId).slice(0, 8)))
        .catch(() => setResults([])).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, productId]);

  async function save(next: Item[]) {
    setBusy(true); setNote(null);
    try {
      const r = await fetch(`/api/v1/catalog/products/${productId}/related`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: next.map((i) => i.id) }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? "Couldn't save");
      setItems(b.items);
      setNote({ ok: true, text: "Saved. The product page shows these first." });
    } catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : "Couldn't save" }); } finally { setBusy(false); }
  }
  const move = (i: number, d: -1 | 1) => { if (!items) return; const next = [...items]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x!); void save(next); };
  const full = (items?.length ?? 0) >= max;

  return (
    <section className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">More to explore <span className="text-sm font-normal text-slate-400">{items?.length ?? 0}/{max}</span></h2>
        <span className="text-xs text-slate-500">Saves straight away</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Choose the products shown under “You may also like” on this product&apos;s page, in this order. Empty spots fill automatically with products from the same category, then related categories, then popular products.</p>

      {items?.length ? (
        <ol className="mt-4 space-y-2">
          {items.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2.5">
              <span className="w-5 text-center text-xs font-semibold text-slate-400">{i + 1}</span>
              {p.coverImageUrl ? <img src={p.coverImageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-slate-100 object-cover" /> : <span className="h-11 w-11 shrink-0 rounded-lg bg-slate-100" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.title}</span>
                <span className="block truncate text-xs text-slate-500">{money(p.pricePaise)} · {p.storeName}{p.status !== "LIVE" ? <b className="ml-1 text-amber-700">· not live, hidden on the store</b> : null}</span>
              </span>
              <span className="flex shrink-0 gap-1">
                <button type="button" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg ring-1 ring-slate-200 disabled:opacity-30">↑</button>
                <button type="button" aria-label="Move down" disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg ring-1 ring-slate-200 disabled:opacity-30">↓</button>
                <button type="button" aria-label={`Remove ${p.title}`} disabled={busy} onClick={() => void save(items.filter((x) => x.id !== p.id))} className="grid h-8 w-8 place-items-center rounded-lg text-red-600 ring-1 ring-red-200 hover:bg-red-50">✕</button>
              </span>
            </li>
          ))}
        </ol>
      ) : items ? <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">None chosen: the row is filled automatically.</p> : null}

      <div className="relative mt-4">
        <input value={query} onChange={(e) => setQuery(e.target.value)} disabled={full} placeholder={full ? `Up to ${max} products. Remove one to add another.` : "Search live products to add (name or SKU)"} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50" aria-label="Search products to add" />
        {query.trim().length >= 2 && !full ? (
          <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {searching && !results.length ? <li className="px-3 py-3 text-sm text-slate-500">Searching…</li> : null}
            {!searching && !results.length ? <li className="px-3 py-3 text-sm text-slate-500">No live products match.</li> : null}
            {results.map((p) => {
              const added = items?.some((x) => x.id === p.id);
              return (
                <li key={p.id}>
                  <button type="button" disabled={busy || added} onClick={() => { void save([...(items ?? []), p]); setQuery(""); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-50">
                    {p.coverImageUrl ? <img src={p.coverImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-lg bg-slate-100" />}
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.title}</span><span className="block truncate text-xs text-slate-500">{money(p.pricePaise)} · {p.storeName}</span></span>
                    <span className="shrink-0 text-xs font-semibold text-brand-700">{added ? "Added" : "+ Add"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {note ? <p className={"mt-3 rounded-xl px-3 py-2 text-sm " + (note.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{note.text}</p> : null}
    </section>
  );
}
