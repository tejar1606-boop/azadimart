"use client";

import { useState } from "react";
import { PLATFORM_FEE_EXPLAINER } from "@azadimart/shared";

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** "Platform fee ⓘ ₹8" in a price summary; tapping ⓘ explains what it's for. */
export function PlatformFeeRow({ feePaise, dark = false }: { feePaise: number; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  if (feePaise <= 0) return null;
  return (
    <div>
      <div className={"flex items-center justify-between " + (dark ? "text-white/65" : "text-slate-600")}>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1.5 text-left">
          <span>Platform fee</span>
          <span aria-hidden className={"grid h-4 w-4 place-items-center rounded-full border text-[10px] font-bold " + (dark ? "border-white/50" : "border-slate-400")}>i</span>
          <span className="sr-only">What is the platform fee?</span>
        </button>
        <span className={dark ? "" : "text-slate-700"}>{money(feePaise)}</span>
      </div>
      {open ? (
        <div className={"mt-2 p-3 text-xs leading-5 " + (dark ? "bg-white/10 text-white/80" : "bg-slate-50 text-slate-600")}>
          <p className={"font-semibold " + (dark ? "text-white" : "text-slate-900")}>What is the platform fee?</p>
          <p className="mt-1">{PLATFORM_FEE_EXPLAINER}</p>
        </div>
      ) : null}
    </div>
  );
}
