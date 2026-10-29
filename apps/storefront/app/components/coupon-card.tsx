"use client";

import { useState } from "react";

type Coupon = {
  code: string;
  title: string;
  discountType: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  discountValue: number;
  minimumOrderPaise: number;
  endsAt?: Date | string | null;
};

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Ticket-style coupon with a perforated edge and a one-tap copy. */
export default function CouponCard({ coupon }: { coupon: Coupon }) {
  const [copied, setCopied] = useState(false);
  const headline = coupon.discountType === "PERCENTAGE" ? `${coupon.discountValue}% OFF` : coupon.discountType === "FIXED" ? `${money(coupon.discountValue)} OFF` : "FREE SHIPPING";
  const ends = coupon.endsAt ? new Date(coupon.endsAt) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="relative flex overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex w-24 shrink-0 flex-col items-center justify-center bg-brand px-2 py-4 text-center text-white sm:w-28">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">Save</span>
        <span className="mt-1 text-lg font-bold leading-tight sm:text-xl">{headline.replace(" OFF", "")}</span>
        {headline.endsWith("OFF") ? <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">off</span> : null}
      </div>
      {/* perforation */}
      <span aria-hidden className="absolute left-24 top-0 h-full border-l-2 border-dashed border-white sm:left-28" />
      <span aria-hidden className="absolute -top-2 left-[88px] h-4 w-4 rounded-full bg-canvas sm:left-[104px]" />
      <span aria-hidden className="absolute -bottom-2 left-[88px] h-4 w-4 rounded-full bg-canvas sm:left-[104px]" />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{coupon.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {coupon.minimumOrderPaise > 0 ? `On orders above ${money(coupon.minimumOrderPaise)}` : "No minimum order"}
            {ends ? ` · Ends ${ends.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
          </p>
          <span className="mt-2 inline-flex rounded-full border border-dashed border-brand-400 bg-brand-50 px-3 py-1 font-mono text-xs font-semibold tracking-[0.08em] text-brand-700">{coupon.code}</span>
        </div>
        <button type="button" onClick={() => void copy()} className="shrink-0 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black" aria-label={`Copy code ${coupon.code}`}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
