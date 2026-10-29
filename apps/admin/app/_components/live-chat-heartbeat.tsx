"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Keeps a live-chat agent who set themselves Online counted as online on every
 * Admin page (not only the Live chat page), and tells them when a chat is
 * waiting for them while they're elsewhere in Admin.
 */
export default function LiveChatHeartbeat({ onConsole }: { onConsole: boolean }) {
  const [activeChats, setActiveChats] = useState(0);
  const last = useRef(0);
  useEffect(() => {
    if (onConsole) return; // the Live chat page checks in on its own, every 2 s
    const beat = () => void fetch("/api/v1/live-chat/heartbeat", { method: "POST", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b: { status: string; activeChats: number } | null) => {
      const n = b && b.status !== "OFFLINE" ? b.activeChats : 0;
      if (n > last.current && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification("Live chat", { body: "A customer is waiting for you in live chat", tag: "azm-live-chat" }); } catch { /* not allowed */ }
      }
      last.current = n; setActiveChats(n);
    }).catch(() => undefined);
    beat();
    const timer = setInterval(beat, 20_000);
    const visible = () => { if (!document.hidden) beat(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [onConsole]);
  if (onConsole || !activeChats) return null;
  return (
    <Link href="/live-chat" className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lift hover:bg-slate-800">
      <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22c55e]" /></span>
      {activeChats === 1 ? "1 live chat is waiting for you" : `${activeChats} live chats are waiting for you`} →
    </Link>
  );
}
