"use client";

import { useState } from "react";
import { CASHBACK_EXPLAINER } from "@azadimart/shared";

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * "₹7 cashback to your wallet ⓘ" under a price summary. Not taken off the
 * total: it's added to the wallet after delivery. Tapping ⓘ explains when.
 */
export function CashbackRow({ cashbackPaise, dark = false }: { cashbackPaise: number; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  if (cashbackPaise <= 0) return null;
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={"flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold " + (dark ? "bg-emerald-400/15 text-emerald-200" : "bg-emerald-50 text-emerald-800")}>
        <span>{money(cashbackPaise)} cashback to your LOIMART wallet after delivery</span>
        <span aria-hidden className={"grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px] font-bold " + (dark ? "border-emerald-200/60" : "border-emerald-700/50")}>i</span>
        <span className="sr-only">When do I get the cashback?</span>
      </button>
      {open ? <p className={"px-3 pb-2 pt-1 text-xs leading-5 " + (dark ? "bg-emerald-400/15 text-white/80" : "bg-emerald-50 text-slate-600")}>{CASHBACK_EXPLAINER}</p> : null}
    </div>
  );
}
