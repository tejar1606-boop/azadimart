"use client";

import { ArrowRightIcon } from "./icons";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Clean centred homepage heading: one bold title (sentence case), with an
 * optional small grey note and "View all" link under it. Fades up when
 * scrolled to; headings already on screen skip the entrance. Reduced motion:
 * no animation (CSS). `eyebrow` is accepted for older sections but not shown.
 */
export default function SectionHeading({ heading, subtitle, actionLabel, actionHref }: { eyebrow?: string; heading: string; subtitle?: string; actionLabel?: string; actionHref?: string }) {
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
      <h2 className="azm-sh-title text-[22px] font-bold leading-tight tracking-[-0.01em] text-slate-950 sm:text-[32px]">{heading}</h2>
      {subtitle ? <p className="azm-sh-sub mt-1 max-w-2xl text-[13px] text-slate-500">{subtitle}</p> : null}
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="azm-sh-action group mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline">
          {actionLabel}<ArrowRightIcon size={13} className="transition group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}
