"use client";

import { useEffect, useState } from "react";

type NavItem = { label: string; href: string; isActive: boolean };
type Category = { id: string; name: string; slug: string; parentId: string | null; isActive: boolean; liveCount: number };

const PAGES: Array<{ label: string; href: string }> = [
  { label: "Home", href: "/" },
  { label: "All products", href: "/products" },
  { label: "Wishlist", href: "/wishlist" },
  { label: "Become a seller", href: "/seller" },
];
const CUSTOM = "__custom__";
const field = "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900";

/** Main menu editor: each link points at a category page, a store page, or a custom path. */
export default function NavigationEditor() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [custom, setCustom] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState("Loading…");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/online-store/navigation", { cache: "no-store" }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message ?? "Could not load navigation"); return d.navigation as NavItem[]; }),
      fetch("/api/v1/catalog/categories", { cache: "no-store" }).then((r) => r.json()).then((d) => (d.items ?? []) as Category[]).catch(() => []),
    ]).then(([nav, cats]) => { setItems(nav); setCategories(cats); setStatus(""); }).catch((e) => setStatus(e.message));
  }, []);

  const ordered = categories.filter((c) => !c.parentId).flatMap((parent) => [parent, ...categories.filter((c) => c.parentId === parent.id)]);
  const known = new Set([...PAGES.map((p) => p.href), ...categories.map((c) => "/c/" + c.slug)]);
  const isCustom = (index: number, href: string) => custom.has(index) || !known.has(href);

  const change = (next: NavItem[]) => { setItems(next); setDirty(true); setStatus(""); };
  const update = (index: number, patch: Partial<NavItem>) => change(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index: number, delta: number) => {
    const j = index + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[index], next[j]] = [next[j]!, next[index]!];
    change(next);
    setCustom(new Set());
  };

  function pickTarget(index: number, value: string) {
    if (value === CUSTOM) { setCustom((s) => new Set(s).add(index)); return; }
    setCustom((s) => { const n = new Set(s); n.delete(index); return n; });
    const item = items[index]!;
    const category = categories.find((c) => "/c/" + c.slug === value);
    const page = PAGES.find((p) => p.href === value);
    // Fill the menu text from the choice unless the admin already typed their own.
    const autoLabel = !item.label.trim() || item.label === "New link" || PAGES.some((p) => p.label === item.label) || categories.some((c) => c.name === item.label);
    update(index, { href: value, label: autoLabel ? (category?.name ?? page?.label ?? item.label) : item.label });
  }

  async function save() {
    setBusy(true); setStatus("Saving…");
    try {
      const r = await fetch("/api/v1/online-store/navigation", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: items.map(({ label, href, isActive }) => ({ label, href, isActive })) }) });
      const d = await r.json();
      if (!r.ok) {
        const detail = Array.isArray(d?.error?.details) && d.error.details[0] ? `: ${d.error.details[0].message}` : "";
        throw new Error((d?.error?.message ?? "Save failed") + detail);
      }
      setItems(d.navigation); setCustom(new Set()); setDirty(false);
      setStatus("Menu saved. It's live in the store header.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold">Main menu</p>
          <p className="mt-0.5 text-xs text-slate-500">The links under the search bar. Pick a category to link to its own page, which shows only that category&apos;s products.</p>
        </div>
        <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="shrink-0 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">{busy ? "Saving…" : "Save menu"}</button>
      </div>

      <div className="mt-4 space-y-2.5">
        {items.map((item, index) => {
          const showCustom = isCustom(index, item.href);
          return (
            <div key={index} className={"grid items-end gap-2 rounded-xl border p-3 sm:grid-cols-[auto_1fr_1.2fr_auto] " + (item.isActive ? "border-slate-200" : "border-dashed border-slate-300 bg-slate-50")}>
              <div className="flex gap-1 sm:flex-col">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="grid h-7 w-7 place-items-center rounded-lg border text-xs disabled:opacity-30" aria-label="Move up">↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="grid h-7 w-7 place-items-center rounded-lg border text-xs disabled:opacity-30" aria-label="Move down">↓</button>
              </div>
              <label className="text-xs font-medium text-slate-600">Menu text
                <input className={field + " mt-1"} maxLength={80} value={item.label} onChange={(e) => update(index, { label: e.target.value })} />
              </label>
              <div className="text-xs font-medium text-slate-600">
                <label>Link to
                  <select className={field + " mt-1"} value={showCustom ? CUSTOM : item.href} onChange={(e) => pickTarget(index, e.target.value)}>
                    <optgroup label="Category pages">
                      {ordered.map((c) => <option key={c.id} value={"/c/" + c.slug}>{c.parentId ? "— " : ""}{c.name}{c.isActive ? ` (${c.liveCount} live)` : " (hidden category)"}</option>)}
                    </optgroup>
                    <optgroup label="Store pages">
                      {PAGES.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}
                    </optgroup>
                    <option value={CUSTOM}>Custom link…</option>
                  </select>
                </label>
                {showCustom ? <input className={field + " mt-1.5"} placeholder="/products?q=saree" value={item.href} onChange={(e) => update(index, { href: e.target.value })} aria-label="Custom link" /> : null}
              </div>
              <div className="flex items-center gap-2 pb-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={item.isActive} onChange={(e) => update(index, { isActive: e.target.checked })} /> Show</label>
                <button type="button" onClick={() => { change(items.filter((_, i) => i !== index)); setCustom(new Set()); }} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={items.length >= 20} onClick={() => change([...items, { label: "New link", href: "/products", isActive: true }])} className="rounded-full border border-dashed border-slate-400 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900 disabled:opacity-40">+ Add menu link</button>
          {ordered.length ? (
            <select value="" disabled={items.length >= 20} onChange={(e) => { const c = categories.find((x) => x.id === e.target.value); if (c) change([...items, { label: c.name, href: "/c/" + c.slug, isActive: true }]); }} className="h-10 rounded-full border border-dashed border-slate-400 bg-white px-4 text-sm font-semibold text-slate-700" aria-label="Add a category to the menu">
              <option value="">+ Add a category…</option>
              {ordered.filter((c) => !items.some((i) => i.href === "/c/" + c.slug)).map((c) => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>)}
            </select>
          ) : null}
        </div>
        {status ? <p role="status" className={"text-xs " + (/saved/i.test(status) ? "text-green-700" : "text-slate-500")}>{status}</p> : null}
      </div>
    </div>
  );
}
