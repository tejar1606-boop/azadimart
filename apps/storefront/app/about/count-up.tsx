"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Number that counts up from 0 when it scrolls into view (e.g. 0 → 10,000+),
 * easing out at the end. Shows the final number straight away for people who
 * reduce motion, and in the server HTML (so search engines and no-JS see it).
 */
export default function CountUp({ to, suffix = "", durationMs = 2200, className }: { to: number; suffix?: string; durationMs?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setValue(0);
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 4);
        setValue(Math.round(to * eased));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [to, durationMs]);

  return (
    <span ref={ref} className={className} aria-label={to.toLocaleString("en-IN") + suffix}>
      <span aria-hidden className="tabular-nums">{value.toLocaleString("en-IN")}{value === to ? suffix : ""}</span>
    </span>
  );
}
