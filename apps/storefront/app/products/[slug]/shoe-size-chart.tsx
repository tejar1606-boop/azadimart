"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { KIDS_SHOE_SIZE_CHART, SHOE_SIZE_CHART } from "@azadimart/shared";

/** "Size chart" link for footwear: UK (India) / EU / US sizes and foot length, plus how to measure. */
export default function ShoeSizeChart({ kids = false }: { kids?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"adult" | "kids">(kids ? "kids" : "adult");
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const th = "border-b border-slate-200 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500";
  const td = "border-b border-slate-100 px-3 py-2";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-slate-900 underline underline-offset-4 hover:text-slate-600">📏 Size chart</button>
      {open ? createPortal(
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Shoe size chart" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold">Shoe size chart</h2><p className="text-xs text-slate-500">India uses UK sizes. Sizes vary a little by brand; if you&apos;re between sizes, choose the bigger one.</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="px-2 text-xl leading-none text-slate-500 hover:text-slate-900">×</button>
            </div>
            <div className="mt-4 flex gap-1 border-b border-slate-200">
              {(["adult", "kids"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={"-mb-px border-b-2 px-4 py-2 text-sm font-semibold " + (tab === t ? "border-slate-900" : "border-transparent text-slate-500")}>{t === "adult" ? "Men & women" : "Kids"}</button>)}
            </div>
            <table className="mt-3 w-full text-sm">
              {tab === "adult" ? (
                <>
                  <thead><tr><th className={th}>UK / India</th><th className={th}>EU</th><th className={th}>US men</th><th className={th}>US women</th><th className={th}>Foot (cm)</th></tr></thead>
                  <tbody>{SHOE_SIZE_CHART.map((r) => <tr key={r.uk}><td className={td + " font-bold"}>{r.uk}</td><td className={td}>{r.eu}</td><td className={td}>{r.usMen}</td><td className={td}>{r.usWomen}</td><td className={td}>{r.footCm}</td></tr>)}</tbody>
                </>
              ) : (
                <>
                  <thead><tr><th className={th}>UK / India</th><th className={th}>EU</th><th className={th}>Age (approx.)</th><th className={th}>Foot (cm)</th></tr></thead>
                  <tbody>{KIDS_SHOE_SIZE_CHART.map((r) => <tr key={r.uk}><td className={td + " font-bold"}>{r.uk}</td><td className={td}>{r.eu}</td><td className={td}>{r.age}</td><td className={td}>{r.footCm}</td></tr>)}</tbody>
                </>
              )}
            </table>
            <div className="mt-5 bg-slate-50 p-4 text-sm">
              <p className="font-semibold">How to measure your foot</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">
                <li>Stand on a sheet of paper with your heel against a wall, in the socks you&apos;ll wear.</li>
                <li>Mark the tip of your longest toe and measure from the wall to the mark in cm.</li>
                <li>Measure both feet in the evening (feet are slightly bigger then) and use the longer one.</li>
                <li>Find that length in the &ldquo;Foot (cm)&rdquo; column: that row is your size.</li>
              </ol>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
