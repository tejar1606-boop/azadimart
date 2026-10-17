"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Tone = "SAFFRON" | "GREEN" | "RED" | "NAVY" | "PINK" | "PURPLE";
type Scope = { allProducts?: boolean; categoryIds?: string[]; productIds?: string[] };
type Tag = { id: string; label: string; tone: Tone; scope: Scope; startsAt: string; endsAt: string | null; priority: number; isActive: boolean };
type Drop = { id: string; title: string; slug: string; sellerName: string; droppedAt: string; beforePaise: number };
type Category = { id: string; name: string; parentId: string | null };
type ProductHit = { id: string; title: string; coverImageUrl: string | null; status: string };
type Draft = { id?: string; label: string; tone: Tone; mode: "all" | "categories" | "products"; categoryIds: string[]; products: Array<{ id: string; title: string }>; startsAt: string; endsAt: string; priority: number; isActive: boolean };

const TONES: Array<[Tone, string, string]> = [
  ["SAFFRON", "Saffron", "bg-gradient-to-r from-[#ff9933] to-brand-600"],
  ["GREEN", "Green", "bg-gradient-to-r from-[#1a9e10] to-india-dark"],
  ["RED", "Red", "bg-gradient-to-r from-rose-500 to-red-600"],
  ["NAVY", "Navy", "bg-gradient-to-r from-navy-soft to-navy"],
  ["PINK", "Pink", "bg-gradient-to-r from-pink-500 to-fuchsia-600"],
  ["PURPLE", "Purple", "bg-gradient-to-r from-violet-500 to-purple-700"],
];
const PRESETS = ["Deal of the day", "Limited offer", "Festive offer", "Bestseller", "New arrival", "Trending", "Lowest price", "Clearance sale"];
const toneClass = (tone: string) => TONES.find((t) => t[0] === tone)?.[2] ?? TONES[0]![2];
const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
// <input type="datetime-local"> works in local time without a zone.
const toLocal = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function Chip({ label, tone }: { label: string; tone: string }) {
  return <span className={"inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] text-white shadow-sm " + toneClass(tone)}>🏷 {label || "Your tag"}</span>;
}

function statusOf(tag: Tag): [string, string] {
  const now = Date.now();
  if (!tag.isActive) return ["Off", "bg-slate-100 text-slate-500"];
  if (new Date(tag.startsAt).getTime() > now) return ["Scheduled", "bg-sky-50 text-sky-700"];
  if (tag.endsAt && new Date(tag.endsAt).getTime() <= now) return ["Ended", "bg-slate-100 text-slate-500"];
  return ["Live", "bg-green-50 text-green-700"];
}

const emptyDraft = (): Draft => ({ label: "", tone: "SAFFRON", mode: "products", categoryIds: [], products: [], startsAt: toLocal(new Date().toISOString()), endsAt: "", priority: 0, isActive: true });

export default function OfferTagsManager({ storefrontUrl }: { storefrontUrl: string }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [dropDays, setDropDays] = useState(7);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [t, c] = await Promise.all([
      fetch("/api/v1/offer-tags", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/v1/catalog/categories", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setTags(t.items ?? []); setDrops(t.priceDrops ?? []); setDropDays(t.priceDropDays ?? 7); setCategories(c.items ?? []);
    const ids = [...new Set((t.items ?? []).flatMap((x: Tag) => x.scope.productIds ?? []))];
    if (ids.length) {
      const all = await fetch("/api/v1/catalog/products", { cache: "no-store" }).then((r) => r.json());
      setProductNames(Object.fromEntries((all.items ?? []).map((p: ProductHit) => [p.id, p.title])));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!draft || draft.mode !== "products" || query.trim().length < 2) { setHits([]); return; }
    const timer = setTimeout(() => {
      fetch("/api/v1/catalog/products?status=LIVE&q=" + encodeURIComponent(query.trim()), { cache: "no-store" }).then((r) => r.json()).then((b) => setHits(b.items ?? [])).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, draft]);

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Category";
  const scopeText = (s: Scope) => s.allProducts ? "All products" : [s.categoryIds?.length ? s.categoryIds.map(catName).join(", ") : "", s.productIds?.length ? `${s.productIds.length} product${s.productIds.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");

  function edit(tag: Tag) {
    setDraft({
      id: tag.id, label: tag.label, tone: tag.tone,
      mode: tag.scope.allProducts ? "all" : tag.scope.categoryIds?.length ? "categories" : "products",
      categoryIds: tag.scope.categoryIds ?? [], products: (tag.scope.productIds ?? []).map((id) => ({ id, title: productNames[id] ?? "Product" })),
      startsAt: toLocal(tag.startsAt), endsAt: toLocal(tag.endsAt), priority: tag.priority, isActive: tag.isActive,
    });
    setError(""); setMessage(""); setQuery("");
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError("");
    const body = {
      label: draft.label, tone: draft.tone, priority: draft.priority, isActive: draft.isActive,
      startsAt: fromLocal(draft.startsAt) ?? undefined, endsAt: fromLocal(draft.endsAt),
      scope: { allProducts: draft.mode === "all", categoryIds: draft.mode === "categories" ? draft.categoryIds : [], productIds: draft.mode === "products" ? draft.products.map((p) => p.id) : [] },
    };
    try {
      const response = await fetch(draft.id ? `/api/v1/offer-tags/${draft.id}` : "/api/v1/offer-tags", { method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(result?.error?.details) && result.error.details[0] ? result.error.details[0].message : "";
        throw new Error(detail || result?.error?.message || "Could not save the tag");
      }
      setMessage(`"${draft.label}" ${draft.id ? "updated" : "created"}. It shows on the store ${draft.isActive ? "within its dates" : "once turned on"}.`);
      setDraft(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the tag"); }
    finally { setBusy(false); }
  }

  async function toggle(tag: Tag) {
    await fetch(`/api/v1/offer-tags/${tag.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: tag.label, tone: tag.tone, scope: { allProducts: Boolean(tag.scope.allProducts), categoryIds: tag.scope.categoryIds ?? [], productIds: tag.scope.productIds ?? [] }, startsAt: tag.startsAt, endsAt: tag.endsAt, priority: tag.priority, isActive: !tag.isActive }) });
    await load();
  }

  async function remove(tag: Tag) {
    if (!window.confirm(`Delete the "${tag.label}" tag?`)) return;
    await fetch(`/api/v1/offer-tags/${tag.id}`, { method: "DELETE" });
    await load();
  }

  const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900";
  const card = "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card";

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader
        eyebrow="Storefront"
        title="Offer tags"
        description="Highlight deals with a coloured tag on product photos and pages. Price drops are tagged automatically."
        actions={!draft ? <button type="button" onClick={() => { setDraft(emptyDraft()); setError(""); setMessage(""); }} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600">+ New offer tag</button> : null}
      />
      {message ? <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}

      {draft ? (
        <section className={card + " mt-6"}>
          <h2 className="font-semibold">{draft.id ? "Edit offer tag" : "New offer tag"}</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_176px]">
            <div className="grid gap-4">
              <label className="text-sm font-medium">Tag text
                <input className={field} maxLength={24} value={draft.label} placeholder="e.g. Deal of the day" onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                <span className="mt-1.5 flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p} type="button" onClick={() => setDraft({ ...draft, label: p })} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">{p}</button>)}</span>
              </label>
              <div className="text-sm font-medium">Colour
                <div className="mt-1.5 flex flex-wrap gap-2">{TONES.map(([value, label, cls]) => <button key={value} type="button" title={label} aria-label={label} aria-pressed={draft.tone === value} onClick={() => setDraft({ ...draft, tone: value })} className={"h-8 w-8 rounded-full ring-offset-2 " + cls + (draft.tone === value ? " ring-2 ring-slate-900" : "")} />)}</div>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200" aria-label="Preview">
              <div className="relative aspect-square bg-gradient-to-br from-slate-100 to-brand-50"><span className="absolute left-2 top-2"><Chip label={draft.label} tone={draft.tone} /></span></div>
              <p className="p-2 text-[11px] text-slate-500">Preview on a product card</p>
            </div>
          </div>

          <div className="mt-5 text-sm font-medium">Show this tag on
            <div className="mt-1.5 flex flex-wrap gap-2">
              {([["products", "Selected products"], ["categories", "Whole categories"], ["all", "All products"]] as const).map(([mode, label]) => (
                <button key={mode} type="button" onClick={() => setDraft({ ...draft, mode })} className={"rounded-full px-3.5 py-1.5 text-xs font-semibold " + (draft.mode === mode ? "bg-chrome text-white" : "bg-white ring-1 ring-slate-300")}>{label}</button>
              ))}
            </div>
          </div>
          {draft.mode === "products" ? (
            <div className="mt-3">
              <input className={field + " max-w-md"} placeholder="Search live products by name, SKU or seller" value={query} onChange={(e) => setQuery(e.target.value)} />
              {hits.length ? (
                <ul className="mt-1 max-h-56 max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-card">
                  {hits.filter((h) => !draft.products.some((p) => p.id === h.id)).slice(0, 12).map((h) => (
                    <li key={h.id}><button type="button" onClick={() => { setDraft({ ...draft, products: [...draft.products, { id: h.id, title: h.title }] }); setQuery(""); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                      <span className="h-8 w-8 shrink-0 rounded-md bg-slate-100 bg-cover bg-center" style={h.coverImageUrl ? { backgroundImage: `url("${h.coverImageUrl}")` } : undefined} />{h.title}
                    </button></li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">{draft.products.map((p) => <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{p.title}<button type="button" onClick={() => setDraft({ ...draft, products: draft.products.filter((x) => x.id !== p.id) })} aria-label={`Remove ${p.title}`} className="text-slate-400 hover:text-red-600">✕</button></span>)}</div>
            </div>
          ) : draft.mode === "categories" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.filter((c) => !c.parentId).flatMap((p) => [p, ...categories.filter((c) => c.parentId === p.id)]).map((c) => (
                <label key={c.id} className={"flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 " + (draft.categoryIds.includes(c.id) ? "bg-brand-50 ring-brand/40" : "ring-slate-200")}>
                  <input type="checkbox" checked={draft.categoryIds.includes(c.id)} onChange={(e) => setDraft({ ...draft, categoryIds: e.target.checked ? [...draft.categoryIds, c.id] : draft.categoryIds.filter((x) => x !== c.id) })} />
                  {c.parentId ? "— " : ""}{c.name}
                </label>
              ))}
              <p className="w-full text-xs text-slate-500">A main category includes its sub-categories.</p>
            </div>
          ) : <p className="mt-3 text-xs text-slate-500">Every live product gets this tag (use for store-wide sales).</p>}

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium">Starts<input type="datetime-local" className={field} value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} /></label>
            <label className="text-sm font-medium">Ends (optional)<input type="datetime-local" className={field} value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} /></label>
            <label className="text-sm font-medium">Priority<input type="number" min={0} max={100} className={field} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })} /><span className="mt-1 block text-xs font-normal text-slate-500">If a product has several tags, the highest shows on its card.</span></label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Tag is on</label>
          {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          <div className="mt-5 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Saving…" : draft.id ? "Save changes" : "Create tag"}</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
          </div>
        </section>
      ) : null}

      <section className={card + " mt-6"}>
        <h2 className="font-semibold">Your offer tags</h2>
        {tags.length === 0 ? <p className="mt-3 text-sm text-slate-500">No tags yet. Create one to highlight a deal.</p> : (
          <ul className="mt-3 divide-y divide-slate-100">
            {tags.map((tag) => {
              const [status, statusTone] = statusOf(tag);
              return (
                <li key={tag.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <Chip label={tag.label} tone={tag.tone} />
                    <span className={"rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + statusTone}>{status}</span>
                    <span className="text-xs text-slate-500">{scopeText(tag.scope)} · {new Date(tag.startsAt).toLocaleDateString("en-IN")} → {tag.endsAt ? new Date(tag.endsAt).toLocaleDateString("en-IN") : "no end"}{tag.priority ? ` · priority ${tag.priority}` : ""}</span>
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs font-semibold">
                    <button type="button" onClick={() => edit(tag)} className="rounded-full px-3 py-1.5 ring-1 ring-slate-200 hover:ring-slate-900">Edit</button>
                    <button type="button" onClick={() => void toggle(tag)} className="rounded-full px-3 py-1.5 ring-1 ring-slate-200 hover:ring-slate-900">{tag.isActive ? "Turn off" : "Turn on"}</button>
                    <button type="button" onClick={() => void remove(tag)} className="rounded-full px-3 py-1.5 text-red-600 ring-1 ring-red-200 hover:bg-red-50">Delete</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={card + " mt-6"}>
        <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Automatic price drops</h2><Chip label="Price drop" tone="GREEN" /></div>
        <p className="mt-1 text-sm text-slate-500">When you lower a product&apos;s price (All products → edit), it gets this tag for {dropDays} days and its page shows the saving. Raising the price removes it.</p>
        {drops.length === 0 ? <p className="mt-3 text-sm text-slate-400">No recent price drops.</p> : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {drops.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <a href={`${storefrontUrl}/products/${d.slug}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">{d.title}</a>
                <span className="text-xs text-slate-500">{d.sellerName} · was {money(d.beforePaise)} · since {new Date(d.droppedAt).toLocaleDateString("en-IN")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
