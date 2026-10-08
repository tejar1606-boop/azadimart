"use client";

import Image from "next/image";
import { useState } from "react";

type GalleryMedia = { mediaAssetId: string; mediaStorageKey: string; altText: string | null };

export default function ProductGallery({ title, media }: { title: string; media: GalleryMedia[] }) {
  const [active, setActive] = useState(0);
  const images = media.length ? media : [{ mediaAssetId: "placeholder", mediaStorageKey: "", altText: title }];
  const fallback = { mediaAssetId: "placeholder", mediaStorageKey: "", altText: title }; const activeImage = images[active] ?? images[0] ?? fallback;

  return (
    <section className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:aspect-[4/3] lg:aspect-square">
        {activeImage.mediaStorageKey ? (
          <Image src={"/media/" + activeImage.mediaStorageKey} alt={activeImage.altText ?? title} fill priority sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-slate-100 via-white to-amber-50">
            <span className="text-8xl font-bold tracking-[-0.08em] text-slate-200">{title.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
        <span className="absolute left-4 top-4 rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">Quality checked</span>
      </div>
      {media.length > 1 ? (
        <div className="grid grid-cols-5 gap-2">
          {media.slice(0, 5).map((item, index) => (
            <button type="button" key={item.mediaAssetId} onClick={() => setActive(index)} aria-label={`View product image ${index + 1}`} className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-white transition ${active === index ? "border-slate-950" : "border-slate-200 hover:border-slate-400"}`}>
              <Image src={"/media/" + item.mediaStorageKey} alt={item.altText ?? title} fill sizes="120px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
