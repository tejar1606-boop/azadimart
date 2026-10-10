"use client";

import MediaField from "./media-field";

export type HeroSlideSettings = {
  desktopImageUrl?: string;
  mobileImageUrl?: string;
  desktopVideoUrl?: string;
  mobileVideoUrl?: string;
  href?: string;
  alt?: string;
  /** Overrides the banner-wide time for this slide (seconds). */
  seconds?: number;
  /** For video slides: stay until the video has played to the end. */
  playFullVideo?: boolean;
};

export const SLIDE_SECONDS_DEFAULT = 4;
const clampSeconds = (n: number) => Math.min(30, Math.max(2, Math.round(n)));

const MAX_SLIDES = 8;

/** Slides from settings; the original single-banner fields count as slide 1. */
export function slidesFromSettings(settings: Record<string, unknown>): HeroSlideSettings[] {
  if (Array.isArray(settings.slides)) return settings.slides as HeroSlideSettings[];
  const legacy = { desktopImageUrl: settings.desktopImageUrl, mobileImageUrl: settings.mobileImageUrl, desktopVideoUrl: settings.desktopVideoUrl, mobileVideoUrl: settings.mobileVideoUrl, href: settings.primaryHref, alt: settings.heading } as HeroSlideSettings;
  return legacy.desktopImageUrl || legacy.desktopVideoUrl ? [legacy] : [];
}

/** Banner slides editor: add, reorder, remove; each slide has image/video for desktop and mobile plus an optional link. */
/** onChange receives an updater so concurrent uploads always apply to the latest slides. */
export default function HeroSlidesField({ slides, onChange, slideSeconds, onSecondsChange }: { slides: HeroSlideSettings[]; onChange: (update: (current: HeroSlideSettings[]) => HeroSlideSettings[]) => void; slideSeconds: number; onSecondsChange: (seconds: number) => void }) {
  const update = (index: number, patch: Partial<HeroSlideSettings>) => onChange((current) => current.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)));
  const move = (index: number, delta: number) => onChange((current) => {
    const j = index + delta;
    if (j < 0 || j >= current.length) return current;
    const next = [...current];
    [next[index], next[j]] = [next[j]!, next[index]!];
    return next;
  });

  return (
    <div className="space-y-4 md:col-span-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">Banner slides <span className="font-normal text-slate-400">({slides.length}/{MAX_SLIDES})</span></p>
        <p className="text-xs text-slate-500">Shoppers can always pause or swipe</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-4">
        <label className="flex items-center gap-2 text-sm font-medium" htmlFor="slide-seconds">Each slide shows for</label>
        <input id="slide-seconds" type="number" min={2} max={30} step={1} value={slideSeconds} onChange={(e) => onSecondsChange(clampSeconds(Number(e.target.value) || SLIDE_SECONDS_DEFAULT))} className="w-20 rounded-lg border p-2 text-sm" />
        <span className="text-sm">seconds</span>
        <span className="text-xs text-slate-500">2–30 s. You can change it for a single slide below, or let a video play to the end.</span>
      </div>
      {slides.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No slides yet. The designed banner with your heading and buttons is shown until you add one.</p> : null}
      {slides.map((slide, index) => {
        const ready = Boolean(slide.desktopImageUrl || slide.desktopVideoUrl);
        return (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Slide {index + 1} {ready ? null : <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Needs a desktop image or video</span>}</p>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-30" aria-label="Move slide up">↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === slides.length - 1} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-30" aria-label="Move slide down">↓</button>
                <button type="button" onClick={() => onChange((current) => current.filter((_, i) => i !== index))} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600">Remove</button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <MediaField kind="image" label="Desktop image" hint="2880 × 1080 px" size={{ width: 2880, height: 1080 }} value={slide.desktopImageUrl ?? ""} onChange={(v) => update(index, { desktopImageUrl: v || undefined })} />
              <MediaField kind="image" label="Mobile image (optional)" hint="1200 × 1500 px" size={{ width: 1200, height: 1500 }} value={slide.mobileImageUrl ?? ""} onChange={(v) => update(index, { mobileImageUrl: v || undefined })} />
              <MediaField kind="video" label="Desktop video (optional)" hint="Same shape as 2880 × 1080" value={slide.desktopVideoUrl ?? ""} onChange={(v) => update(index, { desktopVideoUrl: v || undefined })} />
              <MediaField kind="video" label="Mobile video (optional)" hint="Same shape as 1200 × 1500" value={slide.mobileVideoUrl ?? ""} onChange={(v) => update(index, { mobileVideoUrl: v || undefined })} />
              <label className="text-sm font-medium">Link (where the banner button goes)
                <input className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="/c/electronics-accessories or https://…" value={slide.href ?? ""} onChange={(e) => update(index, { href: e.target.value || undefined })} />
                <span className="mt-1 block text-xs font-normal text-slate-500">The whole banner is clickable. Empty = All products.</span>
              </label>
              <div className="rounded-xl border border-slate-200 p-3 text-sm md:col-span-2">
                <p className="font-medium">How long this slide shows</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={slide.seconds != null} disabled={Boolean(slide.playFullVideo)} onChange={(e) => update(index, { seconds: e.target.checked ? slideSeconds : undefined })} className="h-4 w-4 accent-[#ff9933]" />
                    Use its own time
                  </label>
                  {slide.seconds != null && !slide.playFullVideo ? (
                    <span className="flex items-center gap-2"><input type="number" min={2} max={30} value={slide.seconds} onChange={(e) => update(index, { seconds: clampSeconds(Number(e.target.value) || slideSeconds) })} className="w-20 rounded-lg border p-1.5 text-sm" aria-label={`Seconds for slide ${index + 1}`} /> seconds</span>
                  ) : null}
                  {slide.desktopVideoUrl || slide.mobileVideoUrl ? (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(slide.playFullVideo)} onChange={(e) => update(index, { playFullVideo: e.target.checked || undefined, seconds: e.target.checked ? undefined : slide.seconds })} className="h-4 w-4 accent-[#ff9933]" />
                      Play the whole video before moving on
                    </label>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{slide.playFullVideo ? "The next slide comes when the video ends." : `Shows for ${slide.seconds ?? slideSeconds} seconds${slide.seconds == null ? " (banner setting)" : ""}.`}</p>
              </div>
              <label className="text-sm font-medium">Describe the banner
                <input className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="e.g. Diwali sale — up to 50% off" maxLength={160} value={slide.alt ?? ""} onChange={(e) => update(index, { alt: e.target.value || undefined })} />
                <span className="mt-1 block text-xs font-normal text-slate-500">Read aloud by screen readers.</span>
              </label>
            </div>
          </div>
        );
      })}
      <button type="button" disabled={slides.length >= MAX_SLIDES} onClick={() => onChange((current) => [...current, {}])} className="rounded-full border border-dashed border-slate-400 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900 disabled:opacity-40">+ Add slide</button>
    </div>
  );
}
