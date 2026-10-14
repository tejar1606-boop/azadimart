"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Tile = { key: string; image: string | null; title: string };

const BADGES = [
  { text: "KYC-verified sellers", pos: "left-0 -top-2", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg> },
  { text: "Cash on Delivery", pos: "right-0 -top-2", icon: <span className="text-[12px] font-bold">₹</span> },
  { text: "Easy 7-day returns", pos: "-bottom-4 right-16", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg> },
];

const ICONS: Record<string, React.ReactNode> = {
  email: <path d="M4 6h16v12H4zM4 7l8 6 8-6" />,
  password: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  name: <><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></>,
  phone: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></>,
};

/** A sign-in / sign-up field with an icon, a branded focus glow and (for passwords) show/hide. */
export function AuthField({ label, icon, type = "text", prefix, ...input }: { label: string; icon: keyof typeof ICONS; prefix?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <label className="block text-sm font-semibold text-slate-800">
      {label}
      <span className="azm-auth-input mt-2 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 transition">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400" aria-hidden>{ICONS[icon]}</svg>
        {prefix ? <span className="shrink-0 text-sm font-medium text-slate-500">{prefix}</span> : null}
        <input {...input} type={isPassword && show ? "text" : type} className="min-w-0 flex-1 bg-transparent py-3 text-[15px] font-normal text-slate-950 outline-none placeholder:text-slate-400" />
        {isPassword ? (
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="shrink-0 rounded-md px-1.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-900">{show ? "Hide" : "Show"}</button>
        ) : null}
      </span>
    </label>
  );
}

/** The reassurance line under the main button. */
export function SecureNote() {
  return (
    <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-india" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      Secure sign-in · Your details are never shared with sellers
    </p>
  );
}

/** Colourful stand-ins until product photos load (or if the store has none yet). */
const FALLBACK: Tile[] = ["Sarees", "Kurtas", "Kitchen", "Decor", "Beauty", "Gadgets", "Footwear", "Tea"].map((title, i) => ({ key: "f" + i, image: null, title }));
const TONES = ["from-brand-300 to-brand-600", "from-india-light to-india", "from-sky-200 to-navy-soft", "from-rose-200 to-rose-500"];

/**
 * Sign-in / sign-up backdrop: drifting tricolour glows, sparkles and a slowly
 * turning 3D ring of real product photos, with the form card on top. All CSS
 * (no video), and still for people who reduce motion.
 */
export default function AuthScene({ headline, sub, children }: { headline: React.ReactNode; sub: string; children: React.ReactNode }) {
  const [tiles, setTiles] = useState<Tile[]>(FALLBACK);

  useEffect(() => {
    fetch("/api/v1/catalog/products?limit=24", { cache: "force-cache" })
      .then((r) => r.json())
      .then((d: { items?: Array<{ id: string; title: string; media?: Array<{ kind: string; storageKey: string }> }> }) => {
        const withPhotos = (d.items ?? []).filter((p) => p.media?.some((m) => m.kind === "IMAGE")).slice(0, 10)
          .map((p) => ({ key: p.id, title: p.title, image: "/media/" + p.media!.find((m) => m.kind === "IMAGE")!.storageKey }));
        if (withPhotos.length >= 6) setTiles(withPhotos);
      })
      .catch(() => undefined);
  }, []);

  const step = 360 / tiles.length;
  const ring = (radius: number, size: string) => (
    <div className="azm-ring-stage" aria-hidden>
      <div className="azm-ring">
        {tiles.map((t, i) => (
          <div key={t.key} className={"azm-ring-tile overflow-hidden rounded-2xl border border-white/30 bg-white shadow-[0_18px_40px_rgba(0,0,0,0.35)] " + size}
            style={{ transform: `rotateY(${i * step}deg) translateZ(${radius}px)` }}>
            {t.image ? (
              <Image src={t.image} alt="" fill sizes="160px" className="object-cover" />
            ) : (
              <span className={"grid h-full w-full place-items-end bg-gradient-to-br p-2 text-xs font-bold text-white " + TONES[i % TONES.length]}>{t.title}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <main className="azm-auth relative isolate overflow-hidden px-4 pb-14 pt-6 sm:px-6 lg:py-14">
      {/* drifting tricolour glows and sparkles */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="azm-glow azm-glow-a" />
        <span className="azm-glow azm-glow-b" />
        <span className="azm-glow azm-glow-c" />
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="azm-spark" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, animationDelay: `${(i % 7) * 0.6}s` }} />
        ))}
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-12">
        <section className="text-white">
          {/* phone: a smaller ring above the form */}
          <div className="relative mx-auto h-[150px] w-full max-w-sm lg:hidden">{ring(150, "h-[96px] w-[74px]")}</div>
          <div className="hidden lg:block">
            <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-brand-300">
              <span className="flex h-1 w-10 overflow-hidden rounded"><i className="flex-1 bg-[#FF9933]" /><i className="flex-1 bg-white" /><i className="flex-1 bg-[#138808]" /></span>LOIMART
            </p>
            <h2 className="mt-4 text-5xl font-extrabold leading-[1.05] tracking-[-0.03em]">{headline}</h2>
            <p className="mt-4 max-w-md text-base leading-7 text-white/75">{sub}</p>
            <div className="relative mt-6 h-[320px]">
              {ring(260, "h-[170px] w-[130px]")}
              {/* floating glass badges */}
              {BADGES.map((b, i) => (
                <span key={b.text} className={"azm-float absolute flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-md " + b.pos} style={{ animationDelay: `${i * 1.3}s` }}>
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-navy">{b.icon}</span>{b.text}
                </span>
              ))}
            </div>
          </div>
        </section>
        <div className="relative">
          <Link href="/" className="sr-only">LOIMART home</Link>
          {children}
        </div>
      </div>
    </main>
  );
}
