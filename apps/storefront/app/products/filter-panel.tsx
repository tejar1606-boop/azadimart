"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isShoeSize } from "@azadimart/shared";
import { CloseIcon } from "../components/icons";

export type PriceRange = { min: string; max: string };
export const PRICE_PRESETS: Array<{ label: string; min: string; max: string }> = [
  { label: "Under ₹299", min: "", max: "299" },
  { label: "₹300 – ₹499", min: "300", max: "499" },
  { label: "₹500 – ₹999", min: "500", max: "999" },
  { label: "₹1,000 – ₹1,999", min: "1000", max: "1999" },
  { label: "₹2,000 – ₹4,999", min: "2000", max: "4999" },
  { label: "₹5,000 & above", min: "5000", max: "" },
];
const inr = (v: string) => "₹" + Number(v).toLocaleString("en-IN");
/** "₹500 – ₹999", "Under ₹299", "₹5,000 & above", or "" when no price filter. */
export function priceLabel({ min, max }: PriceRange) {
  const preset = PRICE_PRESETS.find((p) => p.min === min && p.max === max);
  if (preset) return preset.label;
  if (min && max) return `${inr(min)} – ${inr(max)}`;
  if (min) return `${inr(min)} & above`;
  if (max) return `Under ${inr(max)}`;
  return "";
}

/** Sizes in shopper-friendly groups, so shoes, kids' ages and luggage aren't one long jumble. */
export function groupSizes(sizes: string[]) {
  const groups: Array<{ label: string; test: (s: string) => boolean }> = [
    { label: "Clothing", test: (s) => /^(xxs|xs|s|m|l|xl|xxl|[2-5]xl|free size)$/i.test(s) },
    { label: "Footwear", test: isShoeSize },
    { label: "Kids (age)", test: (s) => /^\d+(-\d+)?\s*[my]$/i.test(s) },
    { label: "Waist (inches)", test: (s) => /^\d{2}$/.test(s) },
    { label: "Bra", test: (s) => /^\d{2}[a-h]{1,2}$/i.test(s) },
  ];
  const out = groups.map((g) => ({ label: g.label, sizes: sizes.filter(g.test) }));
  const placed = new Set(out.flatMap((g) => g.sizes));
  out.push({ label: "Other", sizes: sizes.filter((s) => !placed.has(s)) });
  return out.filter((g) => g.sizes.length);
}

type Props = {
  open: boolean;
  onClose: () => void;
  price: PriceRange;
  sizes: string[];
  sizeOptions: string[];
  onApply: (price: PriceRange, sizes: string[]) => void;
};

/**
 * Filters like the big shopping apps: groups on the left (Price, Size), choices
 * on the right, Clear all / Apply at the bottom. A sheet from the bottom on
 * phones, a drawer from the right on desktop. Nothing changes until Apply.
 */
export default function FilterPanel({ open, onClose, price, sizes, sizeOptions, onApply }: Props) {
  const [draftPrice, setDraftPrice] = useState(price);
  const [draftSizes, setDraftSizes] = useState(sizes);
  const tabs = ["Price", ...(sizeOptions.length > 1 ? ["Size"] : [])];
  const [tab, setTab] = useState("Price");
  useEffect(() => { if (open) { setDraftPrice(price); setDraftSizes(sizes); } }, [open, price, sizes]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", esc); };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;

  const count = (t: string) => (t === "Price" ? (draftPrice.min || draftPrice.max ? 1 : 0) : draftSizes.length);
  const toggle = (s: string) => setDraftSizes((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  const field = "h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-slate-950";

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Filters">
      <button type="button" aria-label="Close filters" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col bg-white shadow-lift sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[460px]">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <p className="text-base font-bold">Filters</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100"><CloseIcon size={20} /></button>
        </div>
        <div className="flex min-h-[46vh] flex-1 overflow-hidden">
          <div className="w-[36%] shrink-0 overflow-y-auto bg-slate-50" role="tablist" aria-orientation="vertical">
            {tabs.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={"relative flex w-full items-center justify-between px-4 py-4 text-left text-sm " + (tab === t ? "bg-white font-bold text-slate-950" : "font-medium text-slate-600")}>
                {tab === t ? <span className="absolute inset-y-0 left-0 w-1 bg-[#6A2CD6]" aria-hidden="true" /> : null}
                {t}{count(t) ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#6A2CD6] px-1 text-[11px] font-bold text-white">{count(t)}</span> : null}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4" role="tabpanel">
            {tab === "Price" ? (
              <div>
                <ul className="space-y-1">
                  {PRICE_PRESETS.map((p) => {
                    const on = draftPrice.min === p.min && draftPrice.max === p.max;
                    return (
                      <li key={p.label}>
                        <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                          <input type="radio" name="price" checked={on} onChange={() => setDraftPrice({ min: p.min, max: p.max })} className="h-4 w-4 accent-[#6A2CD6]" />
                          <span className={on ? "font-semibold" : ""}>{p.label}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Or enter a range</p>
                <div className="mt-2 flex items-center gap-2">
                  <input inputMode="numeric" value={draftPrice.min} onChange={(e) => setDraftPrice({ ...draftPrice, min: e.target.value.replace(/\D/g, "") })} placeholder="Min ₹" aria-label="Minimum price" className={field} />
                  <span className="text-slate-400">–</span>
                  <input inputMode="numeric" value={draftPrice.max} onChange={(e) => setDraftPrice({ ...draftPrice, max: e.target.value.replace(/\D/g, "") })} placeholder="Max ₹" aria-label="Maximum price" className={field} />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {groupSizes(sizeOptions).map((g) => (
                  <div key={g.label}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {g.sizes.map((s) => {
                        const on = draftSizes.includes(s);
                        return <button key={s} type="button" aria-pressed={on} onClick={() => toggle(s)} className={"min-w-[3rem] border px-3 py-2 text-xs font-semibold transition " + (on ? "border-[#6A2CD6] bg-[#6A2CD6]/10 text-[#4B1FA0]" : "border-slate-300 text-slate-800 hover:border-slate-950")}>{s}</button>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 border-t border-slate-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => { setDraftPrice({ min: "", max: "" }); setDraftSizes([]); }} className="h-11 flex-1 text-sm font-bold text-slate-700">Clear all</button>
          <button type="button" onClick={() => { onApply(draftPrice, draftSizes); onClose(); }} className="h-11 flex-[2] bg-[#6A2CD6] text-sm font-bold text-white">Apply</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
