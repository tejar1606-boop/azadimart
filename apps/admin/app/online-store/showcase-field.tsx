"use client";

import { useEffect, useState } from "react";
import MediaField from "./media-field";

export type ShowcaseTile = { label?: string; imageUrl?: string; href?: string };
type Category = { id: string; name: string; slug: string; parentId: string | null; isActive: boolean; liveCount: number };

/**
 * Settings for a category row (centred title + cards). Cards fill themselves from the
 * category's sub-categories (or products) unless the admin adds their own.
 */
export default function ShowcaseField({ settings, onChange }: { settings: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => { fetch("/api/v1/catalog/categories", { cache: "no-store" }).then((r) => r.json()).then((d) => setCategories(d.items ?? [])).catch(() => undefined); }, []);
  const ordered = categories.filter((c) => !c.parentId).flatMap((p) => [p, ...categories.filter((c) => c.parentId === p.id)]);
  const str = (key: string) => (typeof settings[key] === "string" ? String(settings[key]) : "");
  const tiles = (Array.isArray(settings.tiles) ? settings.tiles : []) as ShowcaseTile[];
  const setTiles = (update: (current: ShowcaseTile[]) => ShowcaseTile[]) => onChange("tiles", (s: Record<string, unknown>) => update(Array.isArray(s.tiles) ? (s.tiles as ShowcaseTile[]) : []));
  const selected = categories.find((c) => c.id === str("categoryId"));
  const input = "mt-1 w-full rounded-lg border p-2.5 text-sm";

  return (
    <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
      <label className="text-sm font-medium">Category
        <select className={input} value={str("categoryId")} onChange={(e) => onChange("categoryId", e.target.value)}>
          <option value="">Choose a category…</option>
          {ordered.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name} ({c.liveCount} live){c.isActive ? "" : " · hidden"}</option>)}
        </select>
        {!str("categoryId") ? <span className="mt-1 block text-xs font-normal text-amber-700">Pick a category, or this banner stays hidden.</span> : null}
      </label>
      <label className="text-sm font-medium">Heading
        <input className={input} placeholder={selected?.name ?? "Uses the category name"} value={str("heading")} onChange={(e) => onChange("heading", e.target.value)} />
      </label>
      <label className="text-sm font-medium">Small text above the heading
        <input className={input} placeholder="Top category" value={str("eyebrow")} onChange={(e) => onChange("eyebrow", e.target.value)} />
      </label>
      <label className="text-sm font-medium">Short line (optional)
        <input className={input} placeholder="e.g. Sarees, kurtis and more from ₹199" value={str("subtitle")} onChange={(e) => onChange("subtitle", e.target.value)} />
      </label>
      <label className="text-sm font-medium">Link text under the title
        <input className={input} placeholder="View all" value={str("buttonLabel")} onChange={(e) => onChange("buttonLabel", e.target.value)} />
      </label>
      <div className="space-y-2 md:col-span-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Cards <span className="font-normal text-slate-400">({tiles.length}/6)</span></p>
          <p className="text-xs text-slate-500">{tiles.length ? "Your own cards are shown." : "Automatic: the category's sub-categories, or its newest products."}</p>
        </div>
        {tiles.map((tile, i) => (
          <div key={i} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <MediaField kind="image" label={`Card ${i + 1} photo`} hint="600 × 600 px" size={{ width: 600, height: 600 }} value={tile.imageUrl ?? ""} onChange={(v) => setTiles((all) => all.map((t, j) => (j === i ? { ...t, imageUrl: v || undefined } : t)))} />
            <div className="space-y-2">
              <label className="block text-sm font-medium">Label<input className={input} maxLength={40} placeholder="e.g. Sarees" value={tile.label ?? ""} onChange={(e) => setTiles((all) => all.map((t, j) => (j === i ? { ...t, label: e.target.value } : t)))} /></label>
              <label className="block text-sm font-medium">Link<input className={input} placeholder={selected ? "/c/" + selected.slug : "/c/…"} value={tile.href ?? ""} onChange={(e) => setTiles((all) => all.map((t, j) => (j === i ? { ...t, href: e.target.value } : t)))} /></label>
              <button type="button" onClick={() => setTiles((all) => all.filter((_, j) => j !== i))} className="text-xs font-semibold text-red-600">Remove card</button>
            </div>
          </div>
        ))}
        <button type="button" disabled={tiles.length >= 6} onClick={() => setTiles((all) => [...all, {}])} className="rounded-full border border-dashed border-slate-400 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900 disabled:opacity-40">+ Add your own card</button>
      </div>
    </div>
  );
}
