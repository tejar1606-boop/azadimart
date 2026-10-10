"use client";

import { BANNER_ROW_SIZES } from "@azadimart/shared";
import MediaField from "./media-field";

export type RowBanner = { imageUrl?: string; href?: string; alt?: string };

/**
 * Banner row editor (Meesho-style mid-page banners): up to 3 banners shown
 * side by side. The required image shape follows the number of banners.
 */
export default function BannerRowField({ banners, onChange }: { banners: RowBanner[]; onChange: (update: (current: RowBanner[]) => RowBanner[]) => void }) {
  const count = Math.min(3, Math.max(1, banners.length)) as 1 | 2 | 3;
  const size = BANNER_ROW_SIZES[count];
  const update = (index: number, patch: Partial<RowBanner>) => onChange((current) => current.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const move = (index: number, delta: number) => onChange((current) => {
    const j = index + delta;
    if (j < 0 || j >= current.length) return current;
    const next = [...current];
    [next[index], next[j]] = [next[j]!, next[index]!];
    return next;
  });

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Banners <span className="font-normal text-slate-400">({banners.length}/3)</span></p>
        <p className="text-xs text-slate-500">
          {banners.length <= 1 ? "1 banner: full width" : banners.length === 2 ? "2 banners: side by side" : "3 banners: side by side"} · upload each at <b>{size.width} × {size.height}</b> px
        </p>
      </div>
      {banners.length > 1 ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Changing the number of banners changes the shape. Re-upload images that no longer fit {size.width} × {size.height}.</p> : null}
      {banners.map((banner, index) => (
        <div key={index} className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Banner {index + 1}</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded-md border px-2 py-1 text-xs disabled:opacity-30" aria-label="Move left">←</button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === banners.length - 1} className="rounded-md border px-2 py-1 text-xs disabled:opacity-30" aria-label="Move right">→</button>
              <button type="button" onClick={() => onChange((current) => current.filter((_, i) => i !== index))} className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600">Remove</button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <MediaField kind="image" label="Image" hint={`${size.width} × ${size.height} px`} size={size} value={banner.imageUrl ?? ""} onChange={(v) => update(index, { imageUrl: v || undefined })} />
            <div className="space-y-3">
              <label className="block text-sm font-medium">Link (where it goes)
                <input className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="/c/fashion" value={banner.href ?? ""} onChange={(e) => update(index, { href: e.target.value || undefined })} />
              </label>
              <label className="block text-sm font-medium">Describe the banner
                <input className="mt-1 w-full rounded-lg border p-2.5 text-sm" maxLength={160} placeholder="e.g. Festive sarees from ₹299" value={banner.alt ?? ""} onChange={(e) => update(index, { alt: e.target.value || undefined })} />
              </label>
            </div>
          </div>
        </div>
      ))}
      <button type="button" disabled={banners.length >= 3} onClick={() => onChange((current) => [...current, {}])} className="rounded-full border border-dashed border-slate-400 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900 disabled:opacity-40">+ Add banner</button>
    </div>
  );
}
