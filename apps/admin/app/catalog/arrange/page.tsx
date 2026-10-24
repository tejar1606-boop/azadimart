"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Item = { id: string; title: string; slug: string; sellerName: string; categoryName: string; arranged: boolean; coverImageUrl: string | null; pricePaise: number | null; available: number };
type Category = { id: string; name: string; parentId: string | null; isActive: boolean; liveCount: number };

/** Products per row on the storefront's desktop grid, so ↑ / ↓ move a product one row. */
const ROW = 5;
const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (from === target) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}

export default function ArrangeProductsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("categoryId");
    if (fromUrl) setCategoryId(fromUrl);
    fetch("/api/v1/catalog/categories", { cache: "no-store" }).then((r) => r.json()).then((b) => setCategories(b.items ?? [])).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/v1/catalog/arrange" + (categoryId ? `?categoryId=${categoryId}` : ""), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not load products");
      setItems(body.items); setSaved(body.items.map((i: Item) => i.id)); setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load products");
    } finally { setLoading(false); }
  }, [categoryId]);
  useEffect(() => { void load(); }, [load]);

  // Badge new products only once an order exists; before that, nothing is "placed".
  const anyArranged = useMemo(() => items.some((i) => i.arranged), [items]);
  const dirty = useMemo(() => items.some((item, i) => item.id !== saved[i]), [items, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Top-level categories followed by their sub-categories, for the pickers.
  const ordered = useMemo(() => categories.filter((c) => !c.parentId).flatMap((parent) => [parent, ...categories.filter((c) => c.parentId === parent.id)]), [categories]);
  const label = (c: Category) => (c.parentId ? "— " : "") + c.name + (c.isActive ? "" : " (hidden)");

  const move = (from: number, to: number) => { setItems((list) => moveItem(list, from, to)); setMessage(""); };

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/v1/catalog/arrange", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: categoryId || null, productIds: items.map((i) => i.id) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not save the order");
      setSaved(items.map((i) => i.id));
      setItems((list) => list.map((i) => ({ ...i, arranged: true })));
      setMessage("Order saved. The store now shows products in this order.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the order");
    } finally { setBusy(false); }
  }

  async function moveToCategory(productIds: string[], target: string) {
    if (!target || !productIds.length) return;
    if (dirty && !window.confirm("You have unsaved order changes. Moving products reloads the list and discards them. Continue?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/v1/catalog/move-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: target, productIds }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not move the products");
      const name = categories.find((c) => c.id === target)?.name ?? "the new category";
      await load();
      setBulkTarget("");
      setMessage(`${body.moved} product${body.moved === 1 ? "" : "s"} moved to ${name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move the products");
    } finally { setBusy(false); }
  }

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const arrow = "grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-xs text-slate-700 hover:border-slate-900 disabled:opacity-30";

  return (
    <main className="px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader
        eyebrow="Catalogue"
        title="Arrange products"
        description="Set the order products appear in on the store. Drag a card, use the arrows, or type a position, then save. ← → moves one place, ↑ ↓ moves one row."
        actions={<Link href="/catalog/categories" className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Manage categories</Link>}
      />

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">Show
          <select value={categoryId} onChange={(e) => { if (dirty && !window.confirm("Discard unsaved order changes?")) return; setCategoryId(e.target.value); }} className="mt-1 block h-11 min-w-64 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">
            <option value="">Whole store (homepage &amp; all products)</option>
            {ordered.map((c) => <option key={c.id} value={c.id}>{label(c)} · {c.liveCount} live</option>)}
          </select>
        </label>
        <p className="pb-3 text-xs text-slate-500">{categoryId ? "Reordering here only swaps these products among their own spots; other categories don't move." : "This is the order on the homepage and in the store's Featured sort."}</p>
      </div>

      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}

      {loading ? <p className="mt-8 text-sm text-slate-500">Loading products…</p> : items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-card"><p className="font-semibold">No live products here.</p><p className="mt-1 text-sm text-slate-500">Only products that are live on the store can be arranged.</p></div>
      ) : (
        <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={(e) => { setDragging(index); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); if (over !== index) setOver(index); }}
              onDragLeave={() => setOver((o) => (o === index ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (dragging !== null) move(dragging, index); setDragging(null); setOver(null); }}
              onDragEnd={() => { setDragging(null); setOver(null); }}
              className={"group relative flex cursor-grab flex-col rounded-2xl border bg-white p-2.5 shadow-card transition active:cursor-grabbing " + (over === index && dragging !== index ? "border-brand ring-2 ring-brand/30" : selected.has(item.id) ? "border-slate-900" : "border-slate-200/80") + (dragging === index ? " opacity-40" : "")}
            >
              <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-100 bg-cover bg-center" style={item.coverImageUrl ? { backgroundImage: `url("${item.coverImageUrl}")` } : undefined}>
                <span className="absolute left-2 top-2 grid h-7 min-w-7 place-items-center rounded-full bg-chrome px-2 text-xs font-bold text-white">{index + 1}</span>
                {anyArranged && !item.arranged ? <span className="absolute bottom-2 left-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">New · not placed yet</span> : null}
                <label className="absolute right-2 top-2 grid h-7 w-7 cursor-pointer place-items-center rounded-lg bg-white/90 shadow" title="Select to move category">
                  <input type="checkbox" className="h-4 w-4" checked={selected.has(item.id)} onChange={() => toggle(item.id)} aria-label={`Select ${item.title}`} />
                </label>
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{item.title}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{item.pricePaise !== null ? money(item.pricePaise) : "No price"} · {item.sellerName}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Category</p>
              <select
                value=""
                disabled={busy}
                onChange={(e) => void moveToCategory([item.id], e.target.value)}
                className="mt-0.5 h-8 w-full truncate rounded-lg border border-slate-200 bg-panel px-2 text-xs text-slate-700 outline-none"
                aria-label={`Category of ${item.title}`}
                title="Move to another category"
              >
                <option value="">{item.categoryName}</option>
                {ordered.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
              </select>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                <div className="flex gap-1">
                  <button type="button" className={arrow} onClick={() => move(index, index - 1)} disabled={index === 0} aria-label="Move left" title="Move left">←</button>
                  <button type="button" className={arrow} onClick={() => move(index, index + 1)} disabled={index === items.length - 1} aria-label="Move right" title="Move right">→</button>
                  <button type="button" className={arrow} onClick={() => move(index, index - ROW)} disabled={index === 0} aria-label="Move up a row" title="Move up one row">↑</button>
                  <button type="button" className={arrow} onClick={() => move(index, index + ROW)} disabled={index === items.length - 1} aria-label="Move down a row" title="Move down one row">↓</button>
                </div>
                <input
                  key={item.id + "-" + index}
                  defaultValue={index + 1}
                  inputMode="numeric"
                  aria-label="Position"
                  title="Type a position and press Enter"
                  className="h-7 w-10 rounded-lg border border-slate-200 text-center text-xs outline-none focus:border-slate-900"
                  onKeyDown={(e) => { if (e.key === "Enter") { const n = Number((e.target as HTMLInputElement).value); if (n >= 1) move(index, n - 1); } }}
                  onBlur={(e) => { const n = Number(e.target.value); if (n >= 1 && n - 1 !== index) move(index, n - 1); else e.target.value = String(index + 1); }}
                />
              </div>
              {index > 0 ? <button type="button" onClick={() => move(index, 0)} className="mt-1.5 text-left text-[11px] font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100 focus:opacity-100">Move to first place</button> : null}
            </li>
          ))}
        </ol>
      )}

      {dirty || selected.size ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lift backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            {selected.size ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{selected.size} selected</span>
                <select value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm">
                  <option value="">Move to category…</option>
                  {ordered.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
                </select>
                <button type="button" disabled={!bulkTarget || busy} onClick={() => void moveToCategory([...selected], bulkTarget)} className="rounded-full bg-chrome px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Move</button>
                <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-semibold text-slate-500">Clear</button>
              </div>
            ) : <span className="text-sm font-semibold">You have unsaved changes to the order</span>}
            {dirty ? (
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setItems((list) => saved.map((id) => list.find((i) => i.id === id)!))} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Discard</button>
                <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Saving…" : "Save order"}</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
