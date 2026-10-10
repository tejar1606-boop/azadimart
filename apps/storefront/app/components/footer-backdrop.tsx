"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cinematic footer background: real footage of the Indian flag flying,
 * darkened behind the text. The video only loads when the footer is near the
 * screen, and is skipped (still poster only) for data saver or "reduce motion".
 */
export default function FooterBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduce || saveData || !ref.current) return;
    const io = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setPlay(true); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/footer/flag-poster.webp)" }} />
      {play ? <video className="absolute inset-0 h-full w-full object-cover" src="/footer/flag-loop.mp4" poster="/footer/flag-poster.webp" autoPlay muted loop playsInline /> : null}
      {/* Dark, slightly navy grade so white text reads clearly over the flag. */}
      <div className="absolute inset-0 bg-[#060b1a]/72" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#060b1a]/40 via-transparent to-[#060b1a]/70" />
    </div>
  );
}
