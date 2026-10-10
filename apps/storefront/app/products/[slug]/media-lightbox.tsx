"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export type LightboxItem = { mediaAssetId: string; mediaStorageKey: string; altText: string | null; kind: "IMAGE" | "VIDEO" };

/**
 * Full-screen product media viewer.
 * Desktop: arrows / ← → keys, click to zoom (pans with the cursor), Esc to close.
 * Mobile: swipe to change, double-tap to zoom, drag to pan while zoomed.
 */
export default function MediaLightbox({ items, index, title, onIndex, onClose }: { items: LightboxItem[]; index: number; title: string; onIndex: (index: number) => void; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const closeButton = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef(0);
  const item = items[index];
  const count = items.length;

  const go = useCallback((delta: number) => { setZoomed(false); onIndex((index + delta + count) % count); }, [count, index, onIndex]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" && count > 1) go(1);
      else if (event.key === "ArrowLeft" && count > 1) go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, go, onClose]);

  function pointAt(clientX: number, clientY: number, target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    setOrigin({ x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 });
  }

  if (!item) return null;
  const src = "/media/" + item.mediaStorageKey;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${title} — media ${index + 1} of ${count}`} className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white">
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span className="tabular-nums text-white/70">{index + 1} / {count}</span>
        <span className="mx-4 hidden truncate text-white/80 sm:block">{title}</span>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl hover:bg-white/20">✕</button>
      </div>

      <div
        className="relative flex-1 select-none overflow-hidden"
        onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
        onTouchStart={(event) => { const t = event.touches[0]; if (t) touch.current = { x: t.clientX, y: t.clientY, t: Date.now() }; }}
        onTouchEnd={(event) => {
          const start = touch.current; const end = event.changedTouches[0];
          touch.current = null;
          if (!start || !end || zoomed) return;
          const dx = end.clientX - start.x, dy = end.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && count > 1) go(dx < 0 ? 1 : -1);
        }}
      >
        {item.kind === "VIDEO" ? (
          <video key={item.mediaAssetId} src={src} className="absolute inset-0 m-auto max-h-full max-w-full" controls autoPlay playsInline />
        ) : (
          <div
            className={"absolute inset-0 " + (zoomed ? "cursor-zoom-out" : "cursor-zoom-in")}
            onClick={(event) => { pointAt(event.clientX, event.clientY, event.currentTarget); setZoomed((value) => !value); }}
            onMouseMove={(event) => { if (zoomed) pointAt(event.clientX, event.clientY, event.currentTarget); }}
            onTouchEnd={(event) => {
              const now = Date.now(); const t = event.changedTouches[0];
              if (t && now - lastTap.current < 300) { pointAt(t.clientX, t.clientY, event.currentTarget); setZoomed((value) => !value); event.preventDefault(); }
              lastTap.current = now;
            }}
            onTouchMove={(event) => { const t = event.touches[0]; if (zoomed && t) pointAt(t.clientX, t.clientY, event.currentTarget); }}
          >
            <Image
              key={item.mediaAssetId}
              src={src}
              alt={item.altText ?? title}
              fill
              sizes="100vw"
              unoptimized
              priority
              draggable={false}
              className="object-contain transition-transform duration-200"
              style={{ transform: zoomed ? "scale(2.5)" : "none", transformOrigin: `${origin.x}% ${origin.y}%` }}
            />
          </div>
        )}
        {count > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous" className="absolute left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-2xl hover:bg-white/25 sm:grid">‹</button>
            <button type="button" onClick={() => go(1)} aria-label="Next" className="absolute right-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-2xl hover:bg-white/25 sm:grid">›</button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 py-3">
          {items.map((entry, i) => (
            <button key={entry.mediaAssetId} type="button" onClick={() => { setZoomed(false); onIndex(i); }} aria-label={entry.kind === "VIDEO" ? "Video" : `Image ${i + 1}`} aria-current={i === index} className={"relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 " + (i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100")}>
              {entry.kind === "VIDEO" ? <span className="grid h-full w-full place-items-center bg-white/10 text-lg">▶</span> : <Image src={"/media/" + entry.mediaStorageKey} alt="" fill sizes="56px" className="object-cover" />}
            </button>
          ))}
        </div>
      ) : null}
      <p className="pb-3 text-center text-xs text-white/50 sm:hidden">{item.kind === "IMAGE" ? "Swipe to browse · double-tap to zoom" : "Swipe to browse"}</p>
    </div>
  );
}
