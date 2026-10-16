"use client";

import { COLOR_PRESETS, MAX_VARIANTS, SIZE_PRESETS, compareSizes, swatchBackground } from "@azadimart/shared";
import { useState } from "react";

export type ColorOption = { name: string; hex: string };
export type VariantRow = { id?: string; color?: string; colorHex?: string; size?: string; sku: string; price: string; compareAt: string; onHand: string; enabled: boolean };
export type VariantState = { colors: ColorOption[]; sizes: string[]; rows: VariantRow[] };
type Img = { id: string; url: string };

const keyOf = (color?: string, size?: string) => `${(color ?? "").toLowerCase()}|${(size ?? "").toLowerCase()}`;
const skuPart = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
export const autoSku = (base: string, color?: string, size?: string) => [base.trim().toUpperCase() || "SKU", color ? skuPart(color) : "", size ? skuPart(size) : ""].filter(Boolean).join("-");

/** Rebuilds the colour × size rows, keeping what the seller typed for combinations that still exist. */
export function buildRows(colors: ColorOption[], sizes: string[], previous: VariantRow[], defaults: { baseSku: string; price: string; compareAt: string }): VariantRow[] {
  const byKey = new Map(previous.map((r) => [keyOf(r.color, r.size), r]));
  const cs: Array<ColorOption | undefined> = colors.length ? colors : [undefined];
  const ss: Array<string | undefined> = sizes.length ? sizes : [undefined];
  const rows: VariantRow[] = [];
  for (const c of cs) for (const s of ss) {
    const old = byKey.get(keyOf(c?.name, s));
    rows.push(old ? { ...old, colorHex: c?.hex } : { color: c?.name, colorHex: c?.hex, size: s, sku: autoSku(defaults.baseSku, c?.name, s), price: defaults.price, compareAt: defaults.compareAt, onHand: "0", enabled: true });
  }
  return rows.slice(0, MAX_VARIANTS);
}

/**
 * Colours and sizes for fashion and similar products. Each combination becomes
 * a variant with its own SKU, price, MRP and stock; combinations the seller
 * doesn't make can be switched off. Photos can be tagged per colour so
 * shoppers see the right photos when they pick a colour.
 */
export default function VariantEditor({ value, onChange, baseSku, defaultPrice, defaultCompareAt, images, imageColors, onImageColors }: {
  value: VariantState; onChange: (next: VariantState) => void; baseSku: string; defaultPrice: string; defaultCompareAt: string;
  images: Img[]; imageColors: Record<string, string>; onImageColors: (next: Record<string, string>) => void;
}) {
  const [customColor, setCustomColor] = useState({ name: "", hex: "#6A2CD6" });
  const [customSize, setCustomSize] = useState("");
  const [bulk, setBulk] = useState({ price: "", compareAt: "", onHand: "" });
  const defaults = { baseSku, price: defaultPrice, compareAt: defaultCompareAt };
  const update = (colors: ColorOption[], sizes: string[]) => onChange({ colors, sizes, rows: buildRows(colors, sizes, value.rows, defaults) });

  const toggleColor = (c: ColorOption) => {
    const has = value.colors.some((x) => x.name.toLowerCase() === c.name.toLowerCase());
    update(has ? value.colors.filter((x) => x.name.toLowerCase() !== c.name.toLowerCase()) : [...value.colors, c], value.sizes);
    if (has) onImageColors(Object.fromEntries(Object.entries(imageColors).filter(([, col]) => col.toLowerCase() !== c.name.toLowerCase())));
  };
  const addSizes = (list: string[]) => {
    const next = [...value.sizes];
    for (const s of list) if (!next.some((x) => x.toLowerCase() === s.toLowerCase())) next.push(s);
    update(value.colors, next.sort(compareSizes));
  };
  const setRow = (i: number, patch: Partial<VariantRow>) => onChange({ ...value, rows: value.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const applyAll = () => onChange({ ...value, rows: value.rows.map((r) => ({ ...r, ...(bulk.price ? { price: bulk.price } : {}), ...(bulk.compareAt ? { compareAt: bulk.compareAt } : {}), ...(bulk.onHand ? { onHand: bulk.onHand } : {}) })) });
  const combos = value.rows.length;
  const on = value.rows.filter((r) => r.enabled).length;
  const input = "w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm";
  const chip = (active: boolean) => "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition " + (active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-900");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold">Colours <span className="font-normal text-slate-400">(optional)</span></p>
        <p className="mt-0.5 text-xs text-slate-500">Tap every colour you sell. Shoppers see these as colour circles.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {COLOR_PRESETS.map((c) => {
            const active = value.colors.some((x) => x.name.toLowerCase() === c.name.toLowerCase());
            return (
              <button key={c.name} type="button" onClick={() => toggleColor(c)} aria-pressed={active} className={chip(active)}>
                <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/15" style={{ background: swatchBackground(c.hex) }} />{c.name}
              </button>
            );
          })}
          {value.colors.filter((c) => !COLOR_PRESETS.some((p) => p.name.toLowerCase() === c.name.toLowerCase())).map((c) => (
            <button key={c.name} type="button" onClick={() => toggleColor(c)} aria-pressed className={chip(true)}>
              <span className="h-3.5 w-3.5 rounded-full ring-1 ring-white/40" style={{ background: swatchBackground(c.hex) }} />{c.name} ×
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={customColor.name} onChange={(e) => setCustomColor((v) => ({ ...v, name: e.target.value }))} maxLength={40} placeholder="Other colour, e.g. Bottle Green" className="w-56 rounded-full border border-slate-200 px-3 py-1.5 text-xs" />
          <input type="color" value={customColor.hex} onChange={(e) => setCustomColor((v) => ({ ...v, hex: e.target.value }))} aria-label="Swatch colour" className="h-8 w-10 cursor-pointer rounded border" />
          <button type="button" disabled={!customColor.name.trim()} onClick={() => { toggleColor({ name: customColor.name.trim(), hex: customColor.hex.toUpperCase() }); setCustomColor((v) => ({ ...v, name: "" })); }} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Add colour</button>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold">Sizes <span className="font-normal text-slate-400">(optional)</span></p>
        <p className="mt-0.5 text-xs text-slate-500">Add a ready-made set, then tap a size to remove it.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SIZE_PRESETS.map((p) => <button key={p.label} type="button" onClick={() => addSizes(p.sizes)} className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-slate-900">+ {p.label}</button>)}
        </div>
        {value.sizes.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {value.sizes.map((s) => <button key={s} type="button" onClick={() => update(value.colors, value.sizes.filter((x) => x !== s))} className={chip(true)} title="Remove">{s} ×</button>)}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={customSize} onChange={(e) => setCustomSize(e.target.value)} maxLength={20} placeholder="Other size, e.g. 42 or 2-3Y" className="w-48 rounded-full border border-slate-200 px-3 py-1.5 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter" && customSize.trim()) { e.preventDefault(); addSizes([customSize.trim()]); setCustomSize(""); } }} />
          <button type="button" disabled={!customSize.trim()} onClick={() => { addSizes([customSize.trim()]); setCustomSize(""); }} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Add size</button>
        </div>
      </div>

      {combos ? (
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Price &amp; stock for each option</p>
              <p className="mt-0.5 text-xs text-slate-500">{value.colors.length ? `${value.colors.length} colour${value.colors.length === 1 ? "" : "s"}` : ""}{value.colors.length && value.sizes.length ? " × " : ""}{value.sizes.length ? `${value.sizes.length} size${value.sizes.length === 1 ? "" : "s"}` : ""} = {combos} option{combos === 1 ? "" : "s"} · {on} on sale. Untick ones you don&apos;t make.{combos >= MAX_VARIANTS ? ` (Up to ${MAX_VARIANTS}.)` : ""}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
            <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-slate-500">Same for all</span>
            <label className="text-[11px] font-semibold">Price ₹<input className={input + " mt-1 w-24"} inputMode="decimal" value={bulk.price} onChange={(e) => setBulk((b) => ({ ...b, price: e.target.value }))} /></label>
            <label className="text-[11px] font-semibold">MRP ₹<input className={input + " mt-1 w-24"} inputMode="decimal" value={bulk.compareAt} onChange={(e) => setBulk((b) => ({ ...b, compareAt: e.target.value }))} /></label>
            <label className="text-[11px] font-semibold">Stock<input className={input + " mt-1 w-20"} inputMode="numeric" value={bulk.onHand} onChange={(e) => setBulk((b) => ({ ...b, onHand: e.target.value }))} /></label>
            <button type="button" onClick={applyAll} disabled={!bulk.price && !bulk.compareAt && !bulk.onHand} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Apply to all</button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr><th className="p-2.5">Sell</th><th className="p-2.5">Option</th><th className="p-2.5">SKU</th><th className="p-2.5">Price ₹</th><th className="p-2.5">MRP ₹</th><th className="p-2.5">Stock</th></tr>
              </thead>
              <tbody>
                {value.rows.map((r, i) => (
                  <tr key={keyOf(r.color, r.size)} className={"border-t border-slate-100 " + (r.enabled ? "" : "opacity-45")}>
                    <td className="p-2.5"><input type="checkbox" checked={r.enabled} onChange={(e) => setRow(i, { enabled: e.target.checked })} aria-label={`Sell ${[r.color, r.size].filter(Boolean).join(" ")}`} /></td>
                    <td className="whitespace-nowrap p-2.5 font-semibold">
                      {r.color ? <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle ring-1 ring-black/15" style={{ background: swatchBackground(r.colorHex) }} /> : null}
                      {[r.color, r.size].filter(Boolean).join(" / ")}
                    </td>
                    <td className="p-2.5"><input className={input + " min-w-36"} value={r.sku} disabled={!r.enabled} onChange={(e) => setRow(i, { sku: e.target.value })} /></td>
                    <td className="p-2.5"><input className={input + " w-24"} inputMode="decimal" value={r.price} disabled={!r.enabled} onChange={(e) => setRow(i, { price: e.target.value })} /></td>
                    <td className="p-2.5"><input className={input + " w-24"} inputMode="decimal" value={r.compareAt} disabled={!r.enabled} onChange={(e) => setRow(i, { compareAt: e.target.value })} /></td>
                    <td className="p-2.5"><input className={input + " w-20"} inputMode="numeric" value={r.onHand} disabled={!r.enabled} onChange={(e) => setRow(i, { onHand: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {value.colors.length && images.length ? (
        <div>
          <p className="text-sm font-semibold">Photos for each colour</p>
          <p className="mt-0.5 text-xs text-slate-500">Tap the photos that show each colour. When a shopper picks a colour, its photos show first. Untagged photos show for every colour.</p>
          <div className="mt-3 space-y-3">
            {value.colors.map((c) => {
              const mine = images.filter((img) => imageColors[img.id]?.toLowerCase() === c.name.toLowerCase()).length;
              return (
                <div key={c.name} className="rounded-xl border border-slate-200 p-3">
                  <p className="flex items-center gap-2 text-xs font-bold"><span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/15" style={{ background: swatchBackground(c.hex) }} />{c.name} <span className="font-normal text-slate-400">· {mine} photo{mine === 1 ? "" : "s"}</span></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {images.map((img) => {
                      const tagged = imageColors[img.id];
                      const isMine = tagged?.toLowerCase() === c.name.toLowerCase();
                      return (
                        <button key={img.id} type="button" aria-pressed={isMine} title={tagged && !isMine ? `Tagged ${tagged}` : undefined}
                          onClick={() => { const next = { ...imageColors }; if (isMine) delete next[img.id]; else next[img.id] = c.name; onImageColors(next); }}
                          className={"relative h-14 w-14 overflow-hidden rounded-lg ring-2 transition " + (isMine ? "ring-slate-950" : tagged ? "opacity-35 ring-transparent" : "ring-transparent hover:ring-slate-300")}>
                          <span className="block h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${img.url}")` }} />
                          {isMine ? <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-slate-950 text-[9px] text-white">✓</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : value.colors.length ? <p className="text-xs text-slate-500">Upload photos in the Media step, then come back here to tag which photos show each colour.</p> : null}
    </div>
  );
}
