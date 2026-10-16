"use client";

import { useEffect, useRef } from "react";

/**
 * Muted looping banner video that downloads only when it's actually on
 * screen. The page has a phone and a desktop copy of each banner (one hidden
 * by CSS); a plain autoPlay video would download both, several MB each.
 * Until it plays, the poster image shows.
 */
export default function LazyVideo({ src, poster, className, label }: { src: string; poster?: string; className: string; label?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void el.play().catch(() => undefined);
      else if (!el.paused) el.pause();
    }, { rootMargin: "200px" });
    observer.observe(el); // a display:none copy never intersects, so it never loads
    return () => observer.disconnect();
  }, [src]);
  return <video ref={ref} className={className} src={src} poster={poster} muted loop playsInline preload="none" aria-label={label} />;
}
