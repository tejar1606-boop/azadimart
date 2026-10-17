"use client";

import { ArrowRightIcon } from "./icons";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Centred homepage heading ("CURATED — UPTO 80% DISCOUNTS —") that animates
 * in when scrolled to: the label fades up, the side lines sweep out from the
 * title, the title rises in, then a soft shine passes over it every few
 * seconds. Headings already on screen when the page opens skip the entrance
 * (no flash) and only get the shine. Reduced motion: no animation (CSS).
 */
export default function SectionHeading({ eyebrow, heading, subtitle, actionLabel, actionHref }: { eyebrow?: string; heading: string; subtitle?: string; actionLabel?: string; actionHref?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "armed" | "in">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) { setState("in"); return; }
    setState("armed");
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setState("in"); observer.disconnect(); }
    }, { rootMargin: "0px 0px -12% 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={"azm-sh flex flex-col items-center text-center" + (state === "armed" ? " azm-sh-armed" : state === "in" ? " azm-sh-in" : "")}>
      {eyebrow ? <p className="azm-sh-eyebrow text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EF5A8A]">{eyebrow}</p> : null}
      <div className="mt-1 flex w-full items-center justify-center gap-3 sm:gap-5">
        <span aria-hidden="true" className="azm-sh-line azm-sh-line-l h-0.5 w-10 shrink-0 rounded-full sm:w-24" />
        <h2 className="azm-sh-title text-[22px] font-bold uppercase leading-tight tracking-[0.02em] text-[#2A0E5F] sm:text-[30px]"><span className="azm-sh-shine" data-text={heading}>{heading}</span></h2>
        <span aria-hidden="true" className="azm-sh-line azm-sh-line-r h-0.5 w-10 shrink-0 rounded-full sm:w-24" />
      </div>
      {subtitle ? <p className="azm-sh-sub mt-1.5 max-w-2xl text-sm text-slate-500">{subtitle}</p> : null}
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="azm-sh-action group mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#6A2CD6] hover:text-[#4A1FA8]">
          {actionLabel}<ArrowRightIcon size={14} className="azm-sh-arrow transition group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}
