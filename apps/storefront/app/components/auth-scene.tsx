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
type Offer = { code: string; title: string; discountType: string; discountValue: number; minimumOrderPaise: number };
const rupees = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");
const offerText = (o: Offer) => o.discountType === "PERCENTAGE" ? `${o.discountValue}% off` : o.discountType === "FIXED" ? `Flat ${rupees(o.discountValue)} off` : "Free delivery";

const TRUST = ["KYC-verified sellers", "Cash on Delivery", "Easy 7-day returns"];
const CHECK = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>;
const offPct = (x: Pick) => (x.compareAtPaise && x.compareAtPaise > x.pricePaise ? Math.round((1 - x.pricePaise / x.compareAtPaise) * 100) : 0);

/**
 * Sign-in / sign-up backdrop, built around offers (that's why shoppers come):
 * how much they can save today, the store-wide coupon codes, and the biggest
 * live deals. All from live store data; nothing invented, no fake timers.
 * On phones a slim offer strip sits above the form so the form stays first.
 */
export default function AuthScene({ headline, sub, children }: { headline: React.ReactNode; sub: string; children: React.ReactNode }) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);

  useEffect(() => {
    fetch("/api/v1/coupons/featured").then((r) => r.json()).then((d: { coupons?: Offer[] }) => setOffers(d.coupons ?? [])).catch(() => undefined);
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

  const upTo = picks.length ? offPct(picks[0]!) : 0;
  const first = offers[0];

  return (
    <main className="azm-auth relative isolate overflow-hidden px-4 pb-14 pt-6 sm:px-6 lg:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="azm-glow azm-glow-a" />
        <span className="azm-glow azm-glow-b" />
        <span className="azm-glow azm-glow-c" />
      </div>

      {/* minmax(0,1fr): the column never grows past the screen, even with large phone text sizes. */}
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-14">
        <section className="min-w-0 text-white">
          {/* phone: the offer in one line, then the form */}
          <div className="lg:hidden">
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-[#F9CB5B] px-4 py-2.5 text-center text-[13px] font-semibold text-[#2A0E5F]">
              {upTo ? <span>Up to <b className="text-[15px]">{upTo}% off</b> today</span> : <span>Today&apos;s offers</span>}
              {first ? <span>· extra {offerText(first)} with <b className="font-mono">{first.code}</b></span> : null}
            </p>
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12px] font-medium text-white/85">
              {TRUST.map((t) => <li key={t} className="flex items-center gap-1.5"><span className="text-[#5fd35a]">{CHECK}</span>{t}</li>)}
            </ul>
          </div>

          <div className="hidden lg:block">
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-brand-300">
                <span className="flex h-1 w-10 overflow-hidden rounded"><i className="flex-1 bg-[#FF9933]" /><i className="flex-1 bg-white" /><i className="flex-1 bg-[#138808]" /></span>Today&apos;s offers
              </p>
              {upTo ? <span className="bg-[#EF5A8A] px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide">Up to {upTo}% off today</span> : null}
            </div>
            <h2 className="mt-4 text-5xl font-extrabold leading-[1.05] tracking-[-0.03em]">{headline}</h2>
            <p className="mt-4 max-w-md text-base leading-7 text-white/75">{sub}</p>

            {offers.length ? (
              <ul className="mt-7 grid max-w-xl gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
                {offers.map((o) => (
                  <li key={o.code} className="relative flex flex-col justify-between border border-dashed border-[#F9CB5B]/80 bg-[#F9CB5B]/10 p-3.5">
                    <p className="text-[22px] font-extrabold leading-tight text-[#F9CB5B]">{offerText(o)}</p>
                    <p className="mt-0.5 text-[12px] text-white/70">{o.minimumOrderPaise ? `On orders above ${rupees(o.minimumOrderPaise)}` : "On any order"}</p>
                    <p className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-[#F9CB5B]/50 pt-2.5 text-[11px] uppercase tracking-[0.14em] text-white/60">
                      Code <span className="bg-[#F9CB5B] px-2 py-1 font-mono text-[12px] font-bold normal-case tracking-wider text-[#2A0E5F]">{o.code}</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            {picks.length ? (
              <div className="mt-8 max-w-xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Biggest deals right now</p>
                <ul className="mt-3 grid grid-cols-3 gap-2">
                  {picks.slice(0, 3).map((p) => (
                    <li key={p.id}>
                      <Link href={"/products/" + p.slug} className="group block border border-white/15 bg-white text-slate-950 transition hover:border-white/50">
                        <span className="relative block aspect-square overflow-hidden bg-slate-100">
                          <Image src={p.image} alt={p.title} fill sizes="180px" className="object-cover transition duration-500 group-hover:scale-105" />
                          <span className="absolute left-0 top-0 bg-[#EF5A8A] px-2 py-1 text-[13px] font-extrabold leading-none text-white">{offPct(p)}%<span className="block text-[9px] font-bold">OFF</span></span>
                        </span>
                        <span className="block p-2">
                          <span className="line-clamp-1 text-[12px] font-medium text-slate-700">{p.title}</span>
                          <span className="mt-0.5 block text-sm font-bold">{rupees(p.pricePaise)} <s className="text-[11px] font-normal text-slate-400">{rupees(p.compareAtPaise!)}</s></span>
                          <span className="block text-[11px] font-semibold text-[#138808]">You save {rupees(p.compareAtPaise! - p.pricePaise)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
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
