"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Ringing = { id: string; customerPhone: string; caller: { customer: { name: string } | null; seller: { name: string } | null } };

/**
 * Incoming-call pop-up on every Admin page for agents who are Available:
 * shows who's calling with Answer / Open, and plays a soft ring.
 */
export default function CallAlert() {
  const pathname = usePathname();
  const router = useRouter();
  const [ringing, setRinging] = useState<Ringing | null>(null);
  const [available, setAvailable] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (pathname === "/calls" || pathname === "/login") return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch("/api/v1/calls/state", { cache: "no-store" });
        if (r.status === 401 || r.status === 403) return; // not on the support desk: stop polling
        const s = await r.json();
        setAvailable(s.status === "AVAILABLE");
        setRinging(s.current?.status === "RINGING" && s.current.direction === "INBOUND" ? s.current : null);
        if (!stop) timer = setTimeout(() => void tick(), s.status === "AVAILABLE" ? 4000 : 30000);
      } catch { if (!stop) timer = setTimeout(() => void tick(), 15000); }
    };
    void tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [pathname]);

  // A soft two-tone ring while a call is waiting for this agent (browsers may block sound until the page was clicked).
  useEffect(() => {
    if (!ringing) return;
    const ring = () => {
      try {
        audio.current ??= new AudioContext();
        const ctx = audio.current;
        for (const [i, f] of [[0, 660], [0.25, 880]] as const) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = f; g.gain.value = 0.05; o.connect(g).connect(ctx.destination);
          o.start(ctx.currentTime + i); o.stop(ctx.currentTime + i + 0.2);
        }
      } catch { /* no sound available */ }
    };
    ring();
    const t = setInterval(ring, 2000);
    return () => clearInterval(t);
  }, [ringing]);

  if (!ringing || !available || pathname === "/calls") return null;
  const name = ringing.caller.customer?.name ?? ringing.caller.seller?.name ?? "Unknown caller";
  async function answer() {
    await fetch(`/api/v1/calls/${ringing!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ACCEPT" }) });
    router.push("/calls");
  }
  return (
    <div role="alertdialog" aria-label="Incoming call" className="fixed bottom-5 right-5 z-[60] w-80 bg-gradient-to-br from-green-600 to-emerald-700 p-5 text-white shadow-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">Incoming call</p>
      <p className="mt-1 text-lg font-bold">{name}</p>
      <p className="font-mono text-sm opacity-90">+91 {ringing.customerPhone}</p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => void answer()} className="flex-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-green-700">Answer</button>
        <button type="button" onClick={() => router.push("/calls")} className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold">Open</button>
      </div>
    </div>
  );
}
