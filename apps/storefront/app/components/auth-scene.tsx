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

/** The reasons to trust LOIMART, as numbers people can scan in a second. */
const PROOF = [
  { value: "10,000+", label: "orders in our first month" },
  { value: "100%", label: "sellers KYC-verified" },
  { value: "COD", label: "pay when it arrives" },
  { value: "7-day", label: "easy returns" },
];
const CHECK = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>;

/**
 * Sign-in / sign-up backdrop. The left side gives a reason to sign in, all
 * from live store data: the newest store-wide offer, proof that LOIMART can
 * be trusted, and what is selling right now. On phones a slim trust strip
 * sits above the form so the form stays first.
 */
export default function AuthScene({ headline, sub, children }: { headline: React.ReactNode; sub: string; children: React.ReactNode }) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [offer, setOffer] = useState<Offer | null>(null);

  useEffect(() => {
    fetch("/api/v1/coupons/featured").then((r) => r.json()).then((d: { coupon: Offer | null }) => setOffer(d.coupon)).catch(() => undefined);
    fetch("/api/v1/catalog/products?limit=24", { cache: "force-cache" })
      .then((r) => r.json())
      .then((d: { items?: Array<{ id: string; slug: string; title: string; media?: Array<{ kind: string; storageKey: string }>; variants?: Array<{ pricePaise: number; compareAtPaise: number | null }> }> }) => {
        const list = (d.items ?? []).flatMap((p) => {
          const photo = p.media?.find((m) => m.kind === "IMAGE");
          const v = [...(p.variants ?? [])].sort((a, b) => a.pricePaise - b.pricePaise)[0];
          return photo && v ? [{ id: p.id, slug: p.slug, title: p.title, image: "/media/" + photo.storageKey, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise }] : [];
        });
        // Best deals first: shoppers notice a real discount.
        const off = (x: Pick) => (x.compareAtPaise && x.compareAtPaise > x.pricePaise ? 1 - x.pricePaise / x.compareAtPaise : 0);
        setPicks(list.sort((a, b) => off(b) - off(a)).slice(0, 3));
      })
      .catch(() => undefined);
  }, []);

  return (
    <main className="azm-auth relative isolate overflow-hidden px-4 pb-14 pt-6 sm:px-6 lg:py-14">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="azm-glow azm-glow-a" />
        <span className="azm-glow azm-glow-b" />
        <span className="azm-glow azm-glow-c" />
      </div>

      {/* minmax(0,1fr): the column never grows past the screen, even with large phone text sizes. */}
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-14">
        <section className="min-w-0 text-white">
          {/* phone: one slim strip of reasons, then the form */}
          <div className="lg:hidden">
            {offer ? (
              <p className="flex items-center justify-center gap-2 rounded-full bg-[#F9CB5B] px-4 py-2 text-center text-[13px] font-semibold text-[#2A0E5F]">
                Sign in for {offerText(offer)} · code <b className="font-mono">{offer.code}</b>
              </p>
            ) : null}
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12px] font-medium text-white/85">
              {["KYC-verified sellers", "Cash on Delivery", "7-day returns"].map((t) => <li key={t} className="flex items-center gap-1.5"><span className="text-[#5fd35a]">{CHECK}</span>{t}</li>)}
            </ul>
          </div>

          <div className="hidden lg:block">
            <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-brand-300">
              <span className="flex h-1 w-10 overflow-hidden rounded"><i className="flex-1 bg-[#FF9933]" /><i className="flex-1 bg-white" /><i className="flex-1 bg-[#138808]" /></span>LOIMART
            </p>
            <h2 className="mt-4 text-5xl font-extrabold leading-[1.05] tracking-[-0.03em]">{headline}</h2>
            <p className="mt-4 max-w-md text-base leading-7 text-white/75">{sub}</p>

            {offer ? (
              <div className="mt-8 flex max-w-lg items-center justify-between gap-4 border border-dashed border-[#F9CB5B]/70 bg-[#F9CB5B]/10 p-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9CB5B]">Members&apos; offer</p>
                  <p className="mt-1 text-xl font-bold">{offerText(offer)}{offer.minimumOrderPaise ? <span className="text-sm font-medium text-white/70"> on orders above {rupees(offer.minimumOrderPaise)}</span> : null}</p>
                </div>
                <span className="shrink-0 bg-[#F9CB5B] px-3 py-2 font-mono text-sm font-bold tracking-wider text-[#2A0E5F]">{offer.code}</span>
              </div>
            ) : null}

            <dl className="mt-8 grid max-w-lg grid-cols-4 divide-x divide-white/15 border-y border-white/15">
              {PROOF.map((p) => (
                <div key={p.label} className="px-3 py-4 first:pl-0">
                  <dt className="text-2xl font-extrabold tracking-[-0.02em] text-white">{p.value}</dt>
                  <dd className="mt-1 text-[12px] leading-4 text-white/65">{p.label}</dd>
                </div>
              ))}
            </dl>

            {picks.length ? (
              <div className="mt-8 max-w-lg">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Trending right now</p>
                <ul className="mt-3 grid grid-cols-3 gap-2">
                  {picks.map((p) => {
                    const off = p.compareAtPaise && p.compareAtPaise > p.pricePaise ? Math.round((1 - p.pricePaise / p.compareAtPaise) * 100) : 0;
                    return (
                      <li key={p.id}>
                        <Link href={"/products/" + p.slug} className="group block border border-white/15 bg-white text-slate-950 transition hover:border-white/50">
                          <span className="relative block aspect-square overflow-hidden bg-slate-100">
                            <Image src={p.image} alt={p.title} fill sizes="160px" className="object-cover transition duration-500 group-hover:scale-105" />
                            {off ? <span className="absolute left-0 top-0 bg-[#EF5A8A] px-1.5 py-0.5 text-[10px] font-bold text-white">{off}% OFF</span> : null}
                          </span>
                          <span className="block p-2">
                            <span className="line-clamp-1 text-[12px] font-medium text-slate-700">{p.title}</span>
                            <span className="mt-0.5 block text-sm font-bold">{rupees(p.pricePaise)}{off ? <s className="ml-1 text-[11px] font-normal text-slate-400">{rupees(p.compareAtPaise!)}</s> : null}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
        <div className="relative min-w-0">
          <Link href="/" className="sr-only">LOIMART home</Link>
          {children}
        </div>
      </div>
    </main>
  );
}
