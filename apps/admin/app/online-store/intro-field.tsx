"use client";

import { useState } from "react";
import MediaField from "./media-field";

export type IntroSettings = {
  enabled?: boolean;
  name?: string;
  kind?: "video" | "image";
  desktopUrl?: string;
  mobileUrl?: string;
  background?: string;
  seconds?: number;
  frequency?: "once" | "daily" | "visit";
  startsOn?: string;
  endsOn?: string;
  href?: string;
};

const FREQUENCY: Array<[NonNullable<IntroSettings["frequency"]>, string]> = [
  ["once", "Once per shopper (for this festival)"],
  ["daily", "Once a day"],
  ["visit", "Every time they open the store"],
];

/**
 * Festival intro animation (like Blinkit's Navratri intro): a full-screen
 * animation when shoppers open the store. Saved with the theme, so it goes
 * live on Publish, and only plays between the chosen dates.
 */
export default function IntroField({ value, onChange }: { value: IntroSettings; onChange: (next: IntroSettings) => void }) {
  const [previewing, setPreviewing] = useState<"desktop" | "phone" | null>(null);
  const set = (patch: Partial<IntroSettings>) => onChange({ ...value, ...patch });
  const kind = value.kind ?? "video";
  const input = "mt-1 w-full rounded-lg border p-2.5 text-sm font-normal";
  const hasMedia = Boolean(value.desktopUrl || value.mobileUrl);
  const today = new Date().toISOString().slice(0, 10);
  const status = !value.enabled ? "Off" : !hasMedia ? "On, but no animation uploaded" : value.endsOn && value.endsOn < today ? "Dates are over" : value.startsOn && value.startsOn > today ? `Starts ${value.startsOn}` : "Live after you publish";

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Festival intro animation</p>
          <p className="mt-1 text-xs text-slate-500">Plays full screen when shoppers open the store (like Blinkit&apos;s Navratri intro), then the store appears. Shoppers can always tap Skip.</p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold">
          <input type="checkbox" className="peer sr-only" checked={value.enabled === true} onChange={(e) => set({ enabled: e.target.checked })} />
          <span className="relative h-6 w-11 rounded-full bg-slate-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-emerald-600 peer-checked:after:translate-x-5" />
          {value.enabled ? "On" : "Off"}
        </label>
      </div>
      <p className={"mt-3 rounded-lg px-3 py-2 text-xs font-semibold " + (value.enabled && hasMedia ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-600")}>Status: {status}</p>

      <div className="mt-3 space-y-3">
        <label className="block text-sm font-medium">Occasion name
          <input className={input} maxLength={60} placeholder="e.g. Navratri, Diwali, Holi" value={value.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
        </label>

        <div className="text-sm font-medium">Animation type
          <div className="mt-1 grid grid-cols-2 gap-2">
            {([["video", "Video", "MP4 or WebM · best quality"], ["image", "Animated image", "Animated WebP"]] as const).map(([k, label, hint]) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => set({ kind: k, desktopUrl: kind === k ? value.desktopUrl : "", mobileUrl: kind === k ? value.mobileUrl : "" })} className={"rounded-lg border px-3 py-2 text-left transition " + (kind === k ? "border-slate-900 bg-slate-900 text-white" : "bg-white hover:border-slate-900")}>
                <span className="block text-xs font-semibold">{label}</span>
                <span className={"block text-[11px] font-normal " + (kind === k ? "text-white/70" : "text-slate-500")}>{hint}</span>
              </button>
            ))}
          </div>
        </div>

        <MediaField kind={kind} label="Phone animation" hint="1080 × 1920 px (tall)" size={{ width: 1080, height: 1920 }} value={value.mobileUrl ?? ""} onChange={(v) => set({ mobileUrl: v })} />
        <MediaField kind={kind} label="Desktop animation" hint="1920 × 1080 px (wide)" size={{ width: 1920, height: 1080 }} value={value.desktopUrl ?? ""} onChange={(v) => set({ desktopUrl: v })} />
        <p className="text-[11px] text-slate-500">Upload one and it&apos;s used on both, centred on the background colour. Keep videos short (3–6 seconds) and small (under 5 MB) so they start instantly; slow connections skip the intro.</p>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">Background colour
            <span className="mt-1 flex items-center gap-2">
              <input type="color" className="h-10 w-12 cursor-pointer rounded border" value={value.background ?? "#ffffff"} onChange={(e) => set({ background: e.target.value })} />
              <span className="text-xs font-normal text-slate-500">Behind the animation</span>
            </span>
          </label>
          {kind === "image" ? (
            <label className="block text-sm font-medium">Show for (seconds)
              <input type="number" min={2} max={10} className={input} value={value.seconds ?? 4} onChange={(e) => set({ seconds: Number(e.target.value) })} />
            </label>
          ) : <p className="self-end text-[11px] text-slate-500">A video closes by itself when it ends (12 seconds at most).</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">Show from
            <input type="date" className={input} value={value.startsOn ?? ""} onChange={(e) => set({ startsOn: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">Until (last day)
            <input type="date" className={input} min={value.startsOn || undefined} value={value.endsOn ?? ""} onChange={(e) => set({ endsOn: e.target.value })} />
          </label>
        </div>
        <p className="-mt-1 text-[11px] text-slate-500">India time. Leave empty to show it until you switch it off. It turns off by itself after the last day.</p>

        <label className="block text-sm font-medium">How often a shopper sees it
          <select className={input} value={value.frequency ?? "once"} onChange={(e) => set({ frequency: e.target.value as IntroSettings["frequency"] })}>
            {FREQUENCY.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>

        <label className="block text-sm font-medium">Tap opens (optional)
          <input className={input} placeholder="/c/fashion  ·  empty = tapping does nothing" value={value.href ?? ""} onChange={(e) => set({ href: e.target.value.trim() })} />
        </label>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={!hasMedia} onClick={() => setPreviewing("phone")} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40">Preview on phone</button>
          <button type="button" disabled={!hasMedia} onClick={() => setPreviewing("desktop")} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40">Preview on desktop</button>
        </div>
        <p className="text-[11px] text-slate-500">Save draft keeps your changes; <b>Publish</b> puts it live. Not shown on cart, checkout or login pages, or to people who turned off animations on their device.</p>
      </div>

      {previewing ? <IntroPreview value={value} device={previewing} onClose={() => setPreviewing(null)} /> : null}
    </div>
  );
}

function IntroPreview({ value, device, onClose }: { value: IntroSettings; device: "desktop" | "phone"; onClose: () => void }) {
  const src = device === "phone" ? value.mobileUrl || value.desktopUrl : value.desktopUrl || value.mobileUrl;
  const frame = device === "phone" ? "h-[80vh] aspect-[9/19.5] rounded-[2rem] border-[10px] border-slate-900" : "w-[min(90vw,1100px)] aspect-video rounded-xl border-[6px] border-slate-900";
  return (
    <div role="dialog" aria-modal="true" aria-label="Intro preview" className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className={"relative grid place-items-center overflow-hidden " + frame} style={{ background: value.background ?? "#ffffff" }} onClick={(e) => e.stopPropagation()}>
        {src ? (value.kind === "image"
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt="" className="h-full w-full object-contain" />
          : <video key={src} src={src} className="h-full w-full object-contain" autoPlay muted playsInline onEnded={onClose} />) : null}
        <span className="absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white">Skip</span>
      </div>
      <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full bg-white px-4 py-2 text-sm font-semibold">Close preview</button>
    </div>
  );
}
