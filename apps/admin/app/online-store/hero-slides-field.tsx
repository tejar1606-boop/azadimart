"use client";

import MediaField from "./media-field";

export type HeroSlideSettings = {
  desktopImageUrl?: string;
  mobileImageUrl?: string;
  desktopVideoUrl?: string;
  mobileVideoUrl?: string;
  href?: string;
  alt?: string;
};

const MAX_SLIDES = 8;

/** Slides from settings; the original single-banner fields count as slide 1. */
export function slidesFromSettings(settings: Record<string, unknown>): HeroSlideSettings[] {
  if (Array.isArray(settings.slides)) return settings.slides as HeroSlideSettings[];
  const legacy = { desktopImageUrl: settings.desktopImageUrl, mobileImageUrl: settings.mobileImageUrl, desktopVideoUrl: settings.desktopVideoUrl, mobileVideoUrl: settings.mobileVideoUrl, href: settings.primaryHref, alt: settings.heading } as HeroSlideSettings;
  return legacy.desktopImageUrl || legacy.desktopVideoUrl ? [legacy] : [];
}

/** Banner slides editor: add, reorder, remove; each slide has image/video for desktop and mobile plus an optional link. */
/** onChange receives an updater so concurrent uploads always apply to the latest slides. */
export default function HeroSlidesField({ slides, onChange }: { slides: HeroSlideSettings[]; onChange: (update: (current: HeroSlideSettings[]) => HeroSlideSettings[]) => void }) {
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
        <p className="text-xs text-slate-500">Rotate every 4 s · pause on hover · swipe on mobile</p>
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
              <label className="text-sm font-medium">Link (optional)
                <input className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="/products?categoryId=… or https://…" value={slide.href ?? ""} onChange={(e) => update(index, { href: e.target.value || undefined })} />
                <span className="mt-1 block text-xs font-normal text-slate-500">Leave empty for a banner that isn&apos;t clickable.</span>
              </label>
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
