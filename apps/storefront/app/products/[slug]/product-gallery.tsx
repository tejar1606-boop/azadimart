"use client";

import Image from "next/image";
import { useState } from "react";
import MediaLightbox from "./media-lightbox";

type GalleryMedia = { mediaAssetId: string; mediaStorageKey: string; altText: string | null; kind: "IMAGE" | "VIDEO" };

function PlayIcon() {
  return (
    <span className="absolute inset-0 grid place-items-center bg-black/25">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-white/95 shadow">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
      </span>
    </span>
  );
}

/** Square (1:1) gallery: product images first, then the product video. */
export default function ProductGallery({ title, media }: { title: string; media: GalleryMedia[] }) {
  const ordered = [...media.filter((item) => item.kind === "IMAGE"), ...media.filter((item) => item.kind === "VIDEO")];
  const [active, setActive] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const current = ordered[active] ?? ordered[0];
  const poster = ordered.find((item) => item.kind === "IMAGE");

  return (
    <section className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
        {current?.kind === "VIDEO" ? (
          <video
            key={current.mediaAssetId}
            className="h-full w-full bg-black object-contain"
            src={"/media/" + current.mediaStorageKey}
            poster={poster ? "/media/" + poster.mediaStorageKey : undefined}
            controls
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={`${title} video`}
          />
        ) : current ? (
          <button type="button" onClick={() => setViewerOpen(true)} aria-label={`View larger: ${current.altText ?? title}`} className="absolute inset-0 cursor-zoom-in">
            <Image src={"/media/" + current.mediaStorageKey} alt={current.altText ?? title} fill priority sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" />
          </button>
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-slate-100 via-white to-amber-50">
            <span className="text-8xl font-bold tracking-[-0.08em] text-slate-200">{title.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
        {current?.kind !== "VIDEO" ? <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">Quality checked</span> : null}
        {current ? (
          <button type="button" onClick={() => setViewerOpen(true)} className="absolute bottom-4 right-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow">
            ⤢ View larger
          </button>
        ) : null}
      </div>
      {ordered.length > 1 ? (
        <div className="grid grid-cols-5 gap-2">
          {ordered.slice(0, 9).map((item, index) => (
            <button
              type="button"
              key={item.mediaAssetId}
              onClick={() => setActive(index)}
              aria-label={item.kind === "VIDEO" ? "Play product video" : `View product image ${index + 1}`}
              aria-pressed={active === index}
              className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-white transition ${active === index ? "border-slate-950" : "border-slate-200 hover:border-slate-400"}`}
            >
              {item.kind === "VIDEO" ? (
                <>
                  {poster ? <Image src={"/media/" + poster.mediaStorageKey} alt="" fill sizes="120px" className="object-cover" /> : <span className="absolute inset-0 bg-slate-900" />}
                  <PlayIcon />
                </>
              ) : (
                <Image src={"/media/" + item.mediaStorageKey} alt={item.altText ?? title} fill sizes="120px" className="object-cover" />
              )}
            </button>
          ))}
        </div>
      ) : null}
      {viewerOpen && ordered.length ? (
        <MediaLightbox items={ordered} index={active} title={title} onIndex={setActive} onClose={() => setViewerOpen(false)} />
      ) : null}
    </section>
  );
}
