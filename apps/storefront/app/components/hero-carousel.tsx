"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type HeroSlide = {
  desktopImageUrl?: string;
  mobileImageUrl?: string;
  desktopVideoUrl?: string;
  mobileVideoUrl?: string;
  href?: string;
  alt: string;
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
 * image or video per slide, optional link, autoplay with pause, arrows,
 * dots and swipe. Autoplay is off for users who prefer reduced motion.
 */
export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
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

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused || hovered || reducedMotion) return;
    const timer = window.setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [count, go, hovered, index, paused, reducedMotion]);

  if (!count) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured campaigns"
      className="relative bg-slate-200"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={(event) => { touchX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchX.current; const end = event.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 50 || count < 2) return;
        go(index + (end < start ? 1 : -1));
      }}
    >
      <div className="relative overflow-hidden">
        <div className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }}>
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
              <div key={i} className="w-full shrink-0" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`} aria-hidden={!active}>
                {href ? <Link href={href} tabIndex={active ? 0 : -1} className="block" aria-label={slide.alt}>{art}</Link> : art}
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
                <button key={i} type="button" onClick={() => go(i)} aria-label={`Show banner ${i + 1}`} aria-current={i === index} className={"h-1.5 rounded-full transition-all " + (i === index ? "w-6 bg-white" : "w-1.5 bg-white/60 hover:bg-white/90")} />
              ))}
            </div>
            {!reducedMotion ? (
              <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Play banners" : "Pause banners"} className="grid h-7 w-7 place-items-center rounded-full bg-black/25 text-[10px] text-white backdrop-blur hover:bg-black/40">
                {paused ? "▶" : "❚❚"}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
