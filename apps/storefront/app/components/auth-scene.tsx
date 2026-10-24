"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";


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

type Pick = { id: string; slug: string; title: string; image: string; pricePaise: number; compareAtPaise: number | null };
const rupees = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");

const TRUST = ["KYC-verified sellers", "Cash on Delivery", "Easy 7-day returns"];
const CHECK = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>;
const offPct = (x: Pick) => (x.compareAtPaise && x.compareAtPaise > x.pricePaise ? Math.round((1 - x.pricePaise / x.compareAtPaise) * 100) : 0);

/**
 * Sign-in / sign-up backdrop, built around offers (that's why shoppers come):
 * the biggest live deals, shown calmly as one featured deal and two more. All
 * from live store data; nothing invented, no fake timers. Phones show only
 * the form.
 */
export default function AuthScene({ headline, sub, children }: { headline: React.ReactNode; sub: string; children: React.ReactNode }) {
  const [picks, setPicks] = useState<Pick[]>([]);

  useEffect(() => {
    fetch("/api/v1/catalog/products?limit=48", { cache: "force-cache" })
      .then((r) => r.json())
      .then((d: { items?: Array<{ id: string; slug: string; title: string; media?: Array<{ kind: string; storageKey: string }>; variants?: Array<{ pricePaise: number; compareAtPaise: number | null }> }> }) => {
        const list = (d.items ?? []).flatMap((p) => {
          const photo = p.media?.find((m) => m.kind === "IMAGE");
          const v = [...(p.variants ?? [])].sort((a, b) => a.pricePaise - b.pricePaise)[0];
          return photo && v ? [{ id: p.id, slug: p.slug, title: p.title, image: "/media/" + photo.storageKey, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise }] : [];
        });
        setPicks(list.filter((x) => offPct(x) > 0).sort((a, b) => offPct(b) - offPct(a)).slice(0, 6));
      })
      .catch(() => undefined);
  }, []);


  return (
    <main className="azm-auth relative isolate overflow-hidden px-4 pb-14 pt-6 sm:px-6 lg:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="azm-glow azm-glow-a" />
        <span className="azm-glow azm-glow-b" />
        <span className="azm-glow azm-glow-c" />
      </div>

      {/* minmax(0,1fr): the column never grows past the screen, even with large phone text sizes. */}
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-14">
        {/* Deals show on computers only; phones get just the form. */}
        <section className="hidden min-w-0 text-white lg:block">

          <div className="hidden lg:block">
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-brand-300">
                <span className="flex h-1 w-10 overflow-hidden rounded"><i className="flex-1 bg-[#FF9933]" /><i className="flex-1 bg-white" /><i className="flex-1 bg-[#138808]" /></span>Today&apos;s offers
              </p>
            </div>
            <h2 className="mt-4 text-5xl font-extrabold leading-[1.05] tracking-[-0.03em]">{headline}</h2>
            <p className="mt-4 max-w-md text-base leading-7 text-white/75">{sub}</p>


            {picks.length ? (
              <div className="mt-9 grid max-w-xl grid-cols-[1.6fr_1fr] gap-3">
                {picks.slice(0, 3).map((p, i) => (
                  <Link key={p.id} href={"/products/" + p.slug} className={"group relative flex flex-col overflow-hidden bg-white " + (i === 0 ? "row-span-2" : "")}>
                    {/* The featured photo fills the height of the two cards beside it. */}
                    <span className={"relative block overflow-hidden bg-slate-100 " + (i === 0 ? "min-h-[240px] flex-1" : "aspect-square")}>
                      <Image src={p.image} alt={p.title} fill sizes={i === 0 ? "360px" : "200px"} className="object-cover transition duration-700 group-hover:scale-105" />
                    </span>
                    <span className="absolute left-0 top-0 bg-[#2A0E5F] px-2.5 py-1.5 text-white">
                      <b className={"block font-extrabold leading-none " + (i === 0 ? "text-2xl" : "text-base")}>{offPct(p)}%</b>
                      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/75">off</span>
                    </span>
                    <span className={"block " + (i === 0 ? "p-4" : "p-2.5")}>
                      <span className={"line-clamp-1 font-medium text-slate-700 " + (i === 0 ? "text-[15px]" : "text-[12px]")}>{p.title}</span>
                      <span className={"mt-1 flex items-baseline gap-2 " + (i === 0 ? "" : "text-sm")}>
                        <b className={i === 0 ? "text-xl text-slate-950" : "text-slate-950"}>{rupees(p.pricePaise)}</b>
                        <s className="text-[12px] text-slate-400">{rupees(p.compareAtPaise!)}</s>
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}

            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-white/75">
              {TRUST.map((t) => <li key={t} className="flex items-center gap-1.5"><span className="text-[#5fd35a]">{CHECK}</span>{t}</li>)}
              <li className="flex items-center gap-1.5"><span className="text-[#5fd35a]">{CHECK}</span>10,000+ orders in month one</li>
            </ul>
          </div>
        </section>
        <div className="relative min-w-0 lg:sticky lg:top-28">
          <Link href="/" className="sr-only">LOIMART home</Link>
          {children}
        </div>
      </div>
    </main>
  );
}
