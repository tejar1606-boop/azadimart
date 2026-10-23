"use client";

import { compareSizes, isShoeSize, swatchBackground } from "@azadimart/shared";
import ShoeSizeChart from "./shoe-size-chart";

export type PickerVariant = { id: string; title: string; color?: string; colorHex?: string; size?: string; sizeLabel?: string; stock: number; pricePaise: number };

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Colour circles and size buttons (fashion), like Myntra/Ajio: pick a colour,
 * then a size. Sold-out sizes are crossed out, low stock shows "2 left", and a
 * colour with nothing in stock is struck through. Choosing is instant
 * (handled in the browser by VariantProvider).
 */
export default function VariantPicker({ variants, selectedId, onSelect }: { variants: PickerVariant[]; selectedId: string; onSelect: (id: string) => void }) {
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0]!;
  const colors: Array<{ name: string; hex?: string }> = [];
  for (const v of variants) if (v.color && !colors.some((c) => c.name === v.color)) colors.push({ name: v.color, hex: v.colorHex });
  const sizes = [...new Set(variants.map((v) => v.size).filter((s): s is string => Boolean(s)))].sort(compareSizes);
  const samePrice = new Set(variants.map((v) => v.pricePaise)).size === 1;

  const forColor = (color: string | undefined) => variants.filter((v) => (v.color ?? "") === (color ?? ""));
  const colorTarget = (color: string) => {
    const list = forColor(color);
    return list.find((v) => v.size === selected.size && v.stock > 0) ?? list.find((v) => v.stock > 0) ?? list.find((v) => v.size === selected.size) ?? list[0]!;
  };
  const sizeTarget = (size: string) => forColor(selected.color).find((v) => v.size === size) ?? (colors.length ? undefined : variants.find((v) => v.size === size));

  return (
    <div className="space-y-5">
      {colors.length ? (
        <div>
          <p className="text-sm"><span className="font-semibold text-slate-500">Colour:</span> <span className="font-bold">{selected.color}</span></p>
          <div className="mt-2.5 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Choose a colour">
            {colors.map((c) => {
              const target = colorTarget(c.name);
              const active = c.name === selected.color;
              const soldOut = forColor(c.name).every((v) => v.stock <= 0);
              return (
                <button key={c.name} type="button" onClick={() => onSelect(target.id)} role="radio" aria-checked={active} aria-label={c.name + (soldOut ? " (sold out)" : "")} title={c.name}
                  className={"relative grid h-10 w-10 place-items-center rounded-full transition " + (active ? "ring-2 ring-slate-950 ring-offset-2" : "ring-1 ring-slate-200 hover:ring-slate-400")}>
                  <span className="h-8 w-8 rounded-full ring-1 ring-black/10" style={{ background: swatchBackground(c.hex) }} />
                  {soldOut ? <span className="absolute inset-0 m-auto h-[2px] w-10 rotate-45 bg-slate-500/80" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {sizes.length ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm"><span className="font-semibold text-slate-500">{variants.find((v) => v.sizeLabel)?.sizeLabel ?? "Size"}:</span> <span className="font-bold">{selected.size}</span></p>
            {sizes.some(isShoeSize) ? <ShoeSizeChart kids={sizes.some((s) => /^kids/i.test(s))} /> : null}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Choose a size">
            {sizes.map((size) => {
              const target = sizeTarget(size);
              const active = size === selected.size;
              const base = "relative flex min-w-[3rem] flex-col items-center justify-center rounded-xl border px-3 py-2 text-sm font-bold transition";
              if (!target) return <span key={size} className={base + " cursor-not-allowed border-dashed border-slate-200 text-slate-300"} title={`Not made in ${selected.color}`}>{size}</span>;
              const out = target.stock <= 0;
              return (
                <button key={size} type="button" onClick={() => onSelect(target.id)} role="radio" aria-checked={active} aria-label={size + (out ? " (sold out)" : "")}
                  className={base + " " + (active ? "border-slate-950 bg-slate-950 text-white" : out ? "border-slate-200 bg-slate-50 text-slate-400 line-through" : "border-slate-300 bg-white text-slate-900 hover:border-slate-950")}>
                  {size}
                  {!samePrice ? <span className={"text-[10px] font-semibold no-underline " + (active ? "text-white/75" : "text-slate-500")}>{money(target.pricePaise)}</span> : null}
                  {!out && target.stock <= 3 ? <span className={"absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 text-[9px] font-bold " + (active ? "bg-amber-400 text-slate-950" : "bg-amber-100 text-amber-800")}>{target.stock} left</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
