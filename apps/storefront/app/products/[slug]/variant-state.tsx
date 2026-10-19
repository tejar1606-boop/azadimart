"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import AddToCart from "./add-to-cart";
import ProductGallery from "./product-gallery";
import VariantPicker from "./variant-picker";

export type PdpVariant = { id: string; title: string; sku: string; pricePaise: number; compareAtPaise: number | null; stock: number; color?: string; colorHex?: string; size?: string; sizeLabel?: string };
type GalleryItem = { mediaAssetId: string; mediaStorageKey: string; altText: string | null; kind: "IMAGE" | "VIDEO"; color: string | null };

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

type Ctx = { variants: PdpVariant[]; selected: PdpVariant; select: (id: string) => void };
const VariantContext = createContext<Ctx | null>(null);
const useVariant = () => {
  const ctx = useContext(VariantContext);
  if (!ctx) throw new Error("useVariant outside VariantProvider");
  return ctx;
};

/**
 * Holds the shopper's chosen colour/size on the product page. Choosing is
 * instant (no trip to the server); the address bar is updated with
 * ?variant= so the choice can still be shared or reloaded.
 */
export function VariantProvider({ variants, initialId, children }: { variants: PdpVariant[]; initialId: string; children: React.ReactNode }) {
  const [id, setId] = useState(initialId);
  const select = useCallback((next: string) => {
    setId(next);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const value = useMemo(() => ({ variants, selected: variants.find((v) => v.id === id) ?? variants[0]!, select }), [variants, id, select]);
  return <VariantContext.Provider value={value}>{children}</VariantContext.Provider>;
}

/** Price, MRP and % off for the chosen option. */
export function SelectedPrice({ lowestPrice, priceDrop }: { lowestPrice: number; priceDrop: { savedPaise: number; beforePaise: number } | null }) {
  const { selected } = useVariant();
  const hasDiscount = Boolean(selected.compareAtPaise && selected.compareAtPaise > selected.pricePaise);
  const off = hasDiscount ? Math.round((1 - selected.pricePaise / selected.compareAtPaise!) * 100) : 0;
  return (
    <>
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <span className="text-3xl font-bold">{money(selected.pricePaise)}</span>
        {hasDiscount ? <span className="text-base text-slate-500">MRP <span className="line-through">{money(selected.compareAtPaise!)}</span></span> : null}
        {hasDiscount ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{off}% off</span> : null}
      </div>
      {priceDrop && selected.pricePaise === lowestPrice ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-india-light px-2.5 py-1 text-sm font-semibold text-india">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
          Price dropped by {money(priceDrop.savedPaise)} <span className="font-normal text-india/80">(was {money(priceDrop.beforePaise)})</span>
        </p>
      ) : null}
    </>
  );
}

/** Stock for the chosen option, the colour/size picker (or plain option pills) and the SKU. */
export function SelectedStock({ hasOptions }: { hasOptions: boolean }) {
  const { variants, selected, select } = useVariant();
  const stock = selected.stock;
  return (
    <div className="mt-6 rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Availability</p>
      <p className={`mt-1 font-bold ${stock > 0 ? "text-emerald-700" : "text-red-600"}`}>{stock > 0 ? stock < 5 ? `Only ${stock} left` : "In stock" : "Currently out of stock"}</p>
      {hasOptions ? (
        <div className="mt-4"><VariantPicker variants={variants} selectedId={selected.id} onSelect={select} /></div>
      ) : (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Variant</p>
          {variants.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Choose a variant">
              {variants.map((v) => {
                const active = v.id === selected.id;
                return (
                  <button key={v.id} type="button" role="radio" aria-checked={active} onClick={() => select(v.id)}
                    className={"rounded-full border px-3 py-1.5 text-xs font-bold " + (active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700") + (v.stock > 0 ? "" : " line-through opacity-60")}>
                    {v.title} · {money(v.pricePaise)}
                  </button>
                );
              })}
            </div>
          ) : <p className="mt-1 font-semibold">{selected.title}</p>}
        </>
      )}
      <p className="mt-1 text-xs text-slate-400">SKU {selected.sku}</p>
    </div>
  );
}

export function SelectedAddToCart() {
  const { selected } = useVariant();
  return <AddToCart key={selected.id} variantId={selected.id} availableQuantity={selected.stock} />;
}

/** Gallery that follows the chosen colour: its photos first, then photos for every colour. */
export function ColorGallery({ title, media }: { title: string; media: GalleryItem[] }) {
  const { selected } = useVariant();
  const color = selected.color;
  const tagged = color ? media.filter((m) => m.color === color) : [];
  const shown = tagged.length ? [...tagged, ...media.filter((m) => !m.color)] : media;
  return <ProductGallery key={tagged.length ? color : "all"} title={color ? `${title} (${color})` : title} media={shown} />;
}
