"use client";

import { useState } from "react";

/**
 * A coupon as a raised "ticket": 3D bevel and shadow, a light sweep and soft
 * glow to catch the eye (still for people who turn motion off), and a Copy
 * button that copies the code without opening the product.
 */
export default function CouponChip({ code, text, size = "card" }: { code: string; text: string; size?: "card" | "offer" }) {
  const [copied, setCopied] = useState(false);
  const big = size === "offer";

  async function copy(event: React.MouseEvent) {
    // Inside a product card (a link): copy only, don't open the product.
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const area = document.createElement("textarea");
      area.value = code; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.select();
      try { document.execCommand("copy"); } catch { /* nothing else to try */ }
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    // Cards are narrow (two per row on phones): offer on top, code underneath. The product page fits one row.
    <span className={"azm-coupon relative flex min-w-0 overflow-hidden text-white [container-type:inline-size] " + (big ? "flex-wrap items-center gap-x-3 gap-y-2 rounded-xl py-2.5 pl-3.5 pr-3 sm:flex-nowrap sm:pr-2.5" : "flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg px-2 py-1.5")}>
      {/* side notches make it read as a ticket */}
      <span aria-hidden className={"absolute top-1/2 -translate-y-1/2 rounded-full bg-white " + (big ? "-left-2 h-4 w-4" : "-left-1.5 h-3 w-3")} />
      <span aria-hidden className={"absolute top-1/2 -translate-y-1/2 rounded-full bg-white " + (big ? "-right-2 h-4 w-4" : "-right-1.5 h-3 w-3")} />
      <span aria-hidden className="azm-coupon-shine pointer-events-none absolute inset-y-0 -left-1/3 w-1/3" />
      <svg width={big ? 18 : 13} height={big ? 18 : 13} viewBox="0 0 24 24" fill="currentColor" className="azm-coupon-tag relative shrink-0 drop-shadow-sm" aria-hidden>
        <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0l-8.2-8.4ZM8 9.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z" />
      </svg>
      <span className={"relative min-w-0 flex-1 font-bold [text-shadow:0_1px_0_rgba(0,0,0,.18)] " + (big ? "basis-44 text-sm leading-snug sm:basis-auto sm:truncate" : "line-clamp-2 text-[11px] leading-tight")}>{text}</span>
      <button type="button" onClick={(e) => void copy(e)} aria-label={copied ? `Copied ${code}` : `Copy coupon code ${code}`}
        className={"relative flex shrink-0 items-center gap-1 rounded-md border border-dashed border-brand-300 bg-white font-mono font-bold text-brand-700 shadow-[inset_0_-2px_0_rgba(0,0,0,.08)] transition active:translate-y-px " + (big ? "px-2.5 py-1.5 text-xs" : "w-full justify-between px-1 py-1 text-[10px] leading-tight")}>
        <span className="azm-coupon-code min-w-0 break-all text-left tracking-wide">{copied ? "Copied!" : code}</span>
        {copied ? null : (
          <svg width={big ? 13 : 10} height={big ? 13 : 10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="azm-coupon-copy shrink-0" aria-hidden><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
        )}
      </button>
    </span>
  );
}
