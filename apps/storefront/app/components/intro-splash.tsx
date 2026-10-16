"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StoreIntro } from "../lib/chrome";

const SAFETY_SECONDS = 12; // never keep a shopper waiting longer than this
const LOAD_TIMEOUT_MS = 3000; // slow connection: skip rather than show a blank screen
const SKIP_PAGES = ["/checkout", "/cart", "/login", "/register"];

function storageKey(intro: StoreIntro) {
  let h = 0;
  for (const ch of intro.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return "azm-intro-" + (h >>> 0).toString(36);
}

/** True when this shopper should see the intro now (by the admin's "How often" choice). */
function shouldShow(intro: StoreIntro): boolean {
  try {
    const key = storageKey(intro);
    if (intro.frequency === "visit") return !window.sessionStorage.getItem(key);
    const seen = window.localStorage.getItem(key);
    if (!seen) return true;
    if (intro.frequency === "daily") return seen !== new Date().toDateString();
    return false; // "once": once per festival on this device
  } catch {
    return false; // storage blocked: don't risk showing it on every page
  }
}

function markSeen(intro: StoreIntro) {
  try {
    const key = storageKey(intro);
    if (intro.frequency === "visit") window.sessionStorage.setItem(key, "1");
    else window.localStorage.setItem(key, new Date().toDateString());
  } catch { /* ignore */ }
}

/**
 * Full-screen festival animation (like Blinkit's Navratri intro) when a
 * shopper opens the store. Plays the phone or desktop version, then fades
 * out by itself: at the end of the video, or after the set seconds for an
 * animated image. Skip and Esc close it; it never shows on checkout or login
 * pages, and is skipped for people who prefer reduced motion.
 */
export default function IntroSplash({ intro }: { intro: StoreIntro }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState(false);
  const closing = useRef(false);
  const readyRef = useRef(false);

  useLayoutEffect(() => {
    if (SKIP_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!shouldShow(intro)) return;
    setPhone(window.matchMedia("(max-width: 639px)").matches);
    markSeen(intro);
    setOpen(true);
  // Decide once, on the first page the shopper opens.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    window.setTimeout(() => setOpen(false), 350);
  }, []);

  // The store stays visible and usable while the animation downloads; the
  // intro only covers it once it's actually playing (or gives up after 3 s).
  useEffect(() => {
    if (!open) return;
    const slow = window.setTimeout(() => { if (!readyRef.current) setOpen(false); }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(slow);
  }, [open]);

  useEffect(() => {
    if (!open || !ready) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const safety = window.setTimeout(close, SAFETY_SECONDS * 1000);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); window.clearTimeout(safety); };
  }, [open, ready, close]);

  const onReady = useCallback(() => {
    readyRef.current = true;
    setReady(true);
    if (intro.kind === "image") window.setTimeout(close, intro.seconds * 1000);
  }, [intro.kind, intro.seconds, close]);

  if (!open) return null;
  const src = phone ? intro.mobileUrl : intro.desktopUrl;
  const go = intro.href ? () => { close(); router.push(intro.href!); } : undefined;

  return (
    <div
      role="dialog"
      aria-hidden={!ready}
      aria-modal="true"
      aria-label={intro.name ? `${intro.name} greeting` : "Festival greeting"}
      className={"fixed inset-0 z-[100] grid place-items-center transition-opacity duration-300 " + (leaving || !ready ? "pointer-events-none opacity-0" : "opacity-100")}
      style={{ background: intro.background }}
    >
      <button type="button" onClick={go} disabled={!go} aria-label={go ? "Open the offer" : undefined} className={"absolute inset-0 h-full w-full " + (go ? "cursor-pointer" : "cursor-default")}>
        {intro.kind === "video" ? (
          <video
            src={src}
            className="h-full w-full object-contain"
            autoPlay
            muted
            playsInline
            preload="auto"
            onPlaying={onReady}
            onEnded={close}
            onError={close}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-contain" onLoad={onReady} onError={close} />
        )}
      </button>
      <button
        type="button"
        onClick={close}
        className="absolute right-4 top-4 z-10 rounded-full bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-black/60 sm:right-6 sm:top-6"
      >
        Skip
      </button>
    </div>
  );
}
