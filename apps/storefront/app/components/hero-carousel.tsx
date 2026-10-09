"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { countAdView } from "../lib/ad-tracking";

export type HeroSlide = {
  desktopImageUrl?: string;
  mobileImageUrl?: string;
  desktopVideoUrl?: string;
  mobileVideoUrl?: string;
  href?: string;
  alt: string;
  /** Set for a seller's paid ad: labelled "Sponsored", views and clicks are counted. */
  sponsoredId?: string;
};


const INTERVAL_MS = 4000;

function SlideArt({ image, video, alt, active, priority, className }: { image?: string; video?: string; alt: string; active: boolean; priority: boolean; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) void el.play().catch(() => undefined);
    else el.pause();
  }, [active]);
  return (
    <span className={"relative block w-full overflow-hidden " + className}>
      {video ? (
        <video ref={ref} className="absolute inset-0 h-full w-full object-cover" src={video} poster={image || undefined} muted loop playsInline preload={active ? "auto" : "metadata"} aria-label={alt} />
      ) : image ? (
        <Image src={image} alt={alt} fill priority={priority} sizes="100vw" className="object-cover" unoptimized />
      ) : null}
    </span>
  );
}

/**
 * Homepage banner slider: 2880 × 1080 desktop / 1200 × 1500 mobile frames,
 * image or video per slide, optional link, arrows, dots and swipe.
 * Slides advance every 4 s, including while the pointer rests on the
 * banner. Autoplay stops only for the pause button or a hidden tab. With
 * "reduce motion" on, slides still change but without the sliding animation.
 */
export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = slides.length;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused || tabHidden) return;
    const timer = window.setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [count, go, index, paused, tabHidden]);

  const shownId = slides[index]?.sponsoredId;
  useEffect(() => {
    if (shownId && !tabHidden) countAdView(shownId);
  }, [shownId, tabHidden]);

  if (!count) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured campaigns"
      className="relative bg-slate-200"
      onTouchStart={(event) => { touchX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchX.current; const end = event.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 50 || count < 2) return;
        go(index + (end < start ? 1 : -1));
      }}
    >
      {/* Banner art is 2880 × 1080: beyond 1920px wide it stays that size, centred, instead of growing taller. */}
      <div className="relative mx-auto max-w-[1920px]">
      <div className="relative overflow-hidden">
        <div className={"flex " + (reducedMotion ? "" : "transition-transform duration-500 ease-out")} style={{ transform: `translateX(-${index * 100}%)` }}>
          {slides.map((slide, i) => {
            const active = i === index;
            const mobileImage = slide.mobileImageUrl || slide.desktopImageUrl;
            const mobileVideo = slide.mobileVideoUrl || (slide.mobileImageUrl ? undefined : slide.desktopVideoUrl);
            const art = (
              <>
                <SlideArt image={mobileImage} video={mobileVideo} alt={slide.alt} active={active} priority={i === 0} className="aspect-[4/5] sm:hidden" />
                <SlideArt image={slide.desktopImageUrl} video={slide.desktopVideoUrl} alt={slide.alt} active={active} priority={i === 0} className="hidden aspect-[8/3] sm:block" />
              </>
            );
            const href = slide.href ?? "";
            return (
              <div key={i} className="relative w-full shrink-0" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`} aria-hidden={!active}>
                {slide.sponsoredId ? (
                  // Plain link (no prefetch) so only real clicks are counted.
                  <a href={href} tabIndex={active ? 0 : -1} className="block" aria-label={`Sponsored: ${slide.alt}`} rel="sponsored">{art}</a>
                ) : href ? <Link href={href} tabIndex={active ? 0 : -1} className="block" aria-label={slide.alt}>{art}</Link> : art}
                {slide.sponsoredId ? <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur sm:left-5 sm:top-5 sm:text-[11px]">Sponsored</span> : null}
              </div>
            );
          })}
        </div>
      </div>

      {count > 1 ? (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous banner" className="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/25 text-xl text-white backdrop-blur transition hover:bg-white/40 sm:grid">‹</button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Next banner" className="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-xl text-slate-950 shadow transition hover:bg-slate-100 sm:grid">›</button>
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3 sm:bottom-5">
            <div className="flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1.5 backdrop-blur">
              {slides.map((_, i) => (
                <button key={i} type="button" onClick={() => go(i)} aria-label={`Show banner ${i + 1}`} aria-current={i === index} className={"h-1.5 rounded-full transition-all " + (i === index ? "w-6 bg-tiranga-saffron" : "w-1.5 bg-white/70 hover:bg-white")} />
              ))}
            </div>
            <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Play banners" : "Pause banners"} className="grid h-7 w-7 place-items-center rounded-full bg-black/25 text-[10px] text-white backdrop-blur hover:bg-black/40">
              {paused ? "▶" : "❚❚"}
            </button>
          </div>
        </>
      ) : null}
      </div>
    </section>
  );
}
