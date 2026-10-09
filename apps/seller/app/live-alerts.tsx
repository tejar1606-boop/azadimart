"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Alert = { id: string; kind: string; title: string; body: string | null; href: string | null; createdAt: string };

const POLL_MS = 30_000;
const BASE_TITLE = "AzadiMart Seller Hub";

/** Short two-tone chime (no audio file); browsers may block it until the seller has clicked the page once. */
function chime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [[880, 0], [1320, 0.16]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = freq!; osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at!);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at! + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at! + 0.35);
      osc.start(ctx.currentTime + at!); osc.stop(ctx.currentTime + at! + 0.4);
    });
  } catch { /* sound is optional */ }
}

/**
 * Live alerts while Seller Hub is open: checks every 30 seconds and, for each
 * new alert, shows a pop-up, plays a chime, puts "(n)" in the tab title and,
 * if the page is in the background and no push subscription exists, a
 * desktop/phone notification. Refreshes sidebar badges too.
 */
export default function LiveAlerts() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Alert[]>([]);
  const since = useRef<string | null>(null);
  const unread = useRef(0);
  // Alerts already handled (timestamps lose microseconds in the browser, so the newest one can come back).
  const seen = useRef(new Set<string>());

  useEffect(() => {
    let stopped = false;
    async function check() {
      try {
        const url = "/api/v1/notifications" + (since.current ? `?after=${encodeURIComponent(since.current)}` : "");
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { items: Alert[]; unread: number; now: string };
        // First check: remember the newest existing alert (no pop-ups for old ones). Later checks ask only for newer ones.
        const first = since.current === null;
        const fresh = first ? [] : body.items.filter((a) => !seen.current.has(a.id));
        body.items.forEach((a) => seen.current.add(a.id));
        const newest = body.items[0]?.createdAt;
        if (first) since.current = newest ?? "1970-01-01T00:00:00.000Z";
        else if (newest && newest > since.current!) since.current = newest;
        unread.current = body.unread;
        document.title = (body.unread ? `(${body.unread}) ` : "") + document.title.replace(/^\(\d+\)\s*/, "");
        if (!fresh.length || stopped) return;
        setToasts((current) => [...fresh.slice(0, 3), ...current].slice(0, 3));
        chime();
        router.refresh();
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
          const pushOn = reg ? Boolean(await reg.pushManager.getSubscription()) : false;
          // With push on, the service worker already shows it.
          if (!pushOn) fresh.slice(0, 3).forEach((a) => new Notification(a.title, { body: a.body ?? "", tag: a.id, icon: "/alert-icon.png" }));
        }
      } catch { /* try again next time */ }
    }
    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.title = document.title.replace(/^\(\d+\)\s*/, "") || BASE_TITLE; };
  }, [router]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setTimeout(() => setToasts((t) => t.slice(0, -1)), 12_000);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  if (!toasts.length) return null;
  return (
    <div aria-live="polite" className="fixed right-4 top-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((a) => (
        <div key={a.id} role="status" className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lift">
          <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg " + (a.kind === "NEW_ORDER" ? "bg-orange-50" : a.kind.includes("CANCEL") ? "bg-red-50" : "bg-amber-50")} aria-hidden="true">{a.kind === "NEW_ORDER" ? "🛒" : a.kind.includes("CANCEL") ? "✖️" : "⏰"}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{a.title}</p>
            {a.body ? <p className="mt-0.5 text-xs text-slate-500">{a.body}</p> : null}
            <div className="mt-2 flex gap-3 text-xs font-semibold">
              <Link href={a.href ?? "/notices"} onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))} className="text-brand-600">View</Link>
              <button type="button" onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-slate-700">Dismiss</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
