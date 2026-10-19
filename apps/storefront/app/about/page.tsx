import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCategoryRail } from "../lib/category-rail";
import { COMMISSION_FREE_MONTHS, PAYOUT_HOLD_DAYS } from "@azadimart/shared";
import { OpenHelpChatButton } from "@azadimart/ui";
import { BadgeIcon, CashIcon, CheckIcon, ReturnIcon, ShieldIcon, TruckIcon } from "../components/icons";

export const metadata: Metadata = {
  title: "About us",
  description: "LOIMART is an Indian marketplace for verified sellers: quality-checked products, Cash on Delivery and easy 7-day returns. Shop India. Support Indian sellers.",
  alternates: { canonical: "/about" },
};

const SELLER_URL = process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.loimart.com";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "";

/** Founder card. Name and title as they should appear on the page. */
const FOUNDER = { name: "Ravi", title: "CEO & Director, LOIMART", photo: "/about/founder-portrait.webp" };

const PROMISES = [
  { icon: ShieldIcon, title: "Verified sellers", text: "Every seller completes KYC (identity, business and bank details) before they can sell on LOIMART." },
  { icon: BadgeIcon, title: "Quality-checked products", text: "Our team reviews every listing (photos, details and price) before it goes live, and again when it changes." },
  { icon: CashIcon, title: "Cash on Delivery", text: "Pay in cash or UPI when your order reaches your door. No advance payment needed." },
  { icon: ReturnIcon, title: "Easy 7-day returns", text: "Not right? Start a return from My orders within 7 days of delivery." },
  { icon: TruckIcon, title: "Tracked delivery", text: "Follow your parcel from the seller to your doorstep, with the courier and tracking number on your order." },
  { icon: CheckIcon, title: "Real people to help", text: "Chat with our support team live, or with our help assistant any time, about any order." },
];

const STEPS = [
  ["Find something you love", "Browse by category or search across sellers from all over India."],
  ["Order in a few taps", "Pick your size or colour, add your address and choose Cash on Delivery."],
  ["Track it to your door", "The seller packs it, a courier delivers it, and you see every step."],
  ["Pay, keep or return", "Pay on delivery. Changed your mind? Return it within 7 days."],
];

/** About LOIMART: who we are, what shoppers can count on, and why sellers join. */
export default async function AboutPage() {
  // Real category photos for the turning 3D ring in the hero.
  const tiles = (await getCategoryRail().catch(() => [])).filter((c) => !c.parentId && c.imageSrc).slice(0, 10);
  const ringTiles = tiles.length >= 6 ? tiles : [...tiles, ...tiles, ...tiles].slice(0, Math.max(6, tiles.length));
  const step = ringTiles.length ? 360 / ringTiles.length : 0;
  return (
    <main className="bg-canvas">
      {/* Hero: text + a slowly turning 3D ring of real category photos */}
      <section className="relative isolate overflow-hidden bg-[#140630] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-[#6A2CD6]/45 blur-[110px]" />
          <div className="absolute -bottom-48 -left-24 h-[480px] w-[480px] rounded-full bg-[#EF5A8A]/25 blur-[110px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        </div>
        <div className="mx-auto grid max-w-[1280px] items-center gap-6 px-5 pb-6 pt-14 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-4 lg:py-20">
          <div className="text-center lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#F9CB5B] backdrop-blur"><span className="h-1.5 w-1.5 rounded-full bg-[#F9CB5B]" />About LOIMART</p>
            <h1 className="mt-5 text-[38px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[60px]">Shop India.<br /><span className="bg-gradient-to-r from-[#F9CB5B] via-[#FFB38A] to-[#EF5A8A] bg-clip-text text-transparent">Support Indian sellers.</span></h1>
            <p className="mx-auto mt-5 max-w-xl text-[16px] leading-7 text-white/75 sm:text-lg lg:mx-0">LOIMART is an online marketplace where you buy straight from verified Indian sellers: weavers, makers, home cooks, brands and small businesses from every corner of the country.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link href="/products" className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#2A0E5F] shadow-[0_12px_30px_-8px_rgba(255,255,255,0.45)] transition hover:-translate-y-0.5 hover:bg-[#F3EDFD]">Start shopping</Link>
              <a href={SELLER_URL + "/register"} className="rounded-full border border-white/30 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/10">Sell on LOIMART</a>
            </div>
          </div>

          <div className="relative h-[300px] sm:h-[420px] lg:h-[500px]" aria-hidden>
            {ringTiles.length ? (
              <div className="azm-ring-stage">
                <div className="azm-ring">
                  {ringTiles.map((t, i) => (
                    <div key={t.id + i} className="azm-ring-tile azm-about-tile h-[132px] w-[104px] overflow-hidden rounded-2xl border border-white/25 bg-white shadow-[0_24px_50px_rgba(0,0,0,0.45)] sm:h-[190px] sm:w-[150px]"
                      style={{ transform: `rotateY(${i * step}deg) translateZ(var(--ring-r))` }}>
                      <Image src={t.imageSrc!} alt="" fill sizes="160px" loading="eager" className="object-cover" />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-6 text-[10px] font-semibold leading-tight text-white sm:text-xs">{t.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {/* floating glass badges in front of the ring */}
            <span className="azm-float absolute left-0 top-[4%] z-10 rounded-2xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold shadow-xl backdrop-blur-md sm:text-sm">✓ KYC-verified sellers</span>
            <span className="azm-float absolute bottom-[2%] right-0 z-10 rounded-2xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold shadow-xl backdrop-blur-md [animation-delay:-2s] sm:text-sm">₹ Cash on Delivery</span>
            <span className="azm-float absolute bottom-[10%] left-0 z-10 hidden rounded-2xl border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-semibold shadow-xl backdrop-blur-md [animation-delay:-4s] sm:inline-block">↺ 7-day returns</span>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="mx-auto grid max-w-5xl gap-10 px-5 py-14 sm:px-8 sm:py-20 md:grid-cols-[0.9fr_1.1fr] md:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EF5A8A]">Our story</p>
          <h2 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#2A0E5F] sm:text-[36px]">The best of India, from people you can trust</h2>
        </div>
        <div className="space-y-4 text-[15.5px] leading-7 text-slate-600">
          <p>India is full of wonderful things made by people who rarely get a fair shop window online. Great products often stay local, and shoppers can&apos;t tell which sellers to trust.</p>
          <p>We built LOIMART to fix both. Sellers get a modern, fair place to reach customers across India, with simple tools, delivery handled for them and payments straight to their bank. Shoppers get a marketplace where every seller is verified and every product is checked before it goes live.</p>
          <p className="font-semibold text-[#2A0E5F]">Every order on LOIMART supports an Indian seller and the people behind them.</p>
        </div>
      </section>

      {/* Founder */}
      <section className="relative overflow-hidden bg-white">
        <div aria-hidden className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-[#F3EDFD] blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="relative mx-auto w-full max-w-[400px] [perspective:1200px]">
            <div aria-hidden className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-[#6A2CD6] via-[#EF5A8A] to-[#F9CB5B] opacity-80 blur-2xl" />
            <figure className="azm-founder relative overflow-hidden rounded-[2rem] border-[6px] border-white bg-white shadow-[0_40px_80px_-30px_rgba(42,14,95,0.65)]">
              <Image src={FOUNDER.photo} alt={`${FOUNDER.name}, ${FOUNDER.title}`} width={960} height={1200} sizes="(min-width: 1024px) 400px, 90vw" className="h-auto w-full" />
              <figcaption className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/40 bg-white/80 px-4 py-3 shadow-lg backdrop-blur-md">
                <p className="text-lg font-bold leading-tight text-[#2A0E5F]">{FOUNDER.name}</p>
                <p className="text-[13px] font-semibold text-[#6A2CD6]">{FOUNDER.title}</p>
              </figcaption>
            </figure>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EF5A8A]">Meet our founder</p>
            <h2 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#2A0E5F] sm:text-[38px]">Building a marketplace India can trust</h2>
            <blockquote className="relative mt-6 rounded-3xl bg-gradient-to-br from-[#FBF8FF] to-white p-6 ring-1 ring-[#E9DFFB] sm:p-8">
              <span aria-hidden className="absolute -top-5 left-6 font-serif text-[80px] leading-none text-[#6A2CD6]/25">&ldquo;</span>
              <p className="relative text-[17px] font-medium leading-8 text-[#2A0E5F] sm:text-[19px]">Every great product has a person behind it. LOIMART exists so that the seller in a small town gets the same chance as a big brand, and every shopper can buy from them with complete confidence.</p>
            </blockquote>
            <div className="mt-6 space-y-4 text-[15.5px] leading-7 text-slate-600">
              <p>As CEO and Director, {FOUNDER.name} leads LOIMART&apos;s mission to give India&apos;s sellers a fair, modern place to grow, and to make online shopping simple and safe for every customer.</p>
              <p>That vision shapes how LOIMART works every day: sellers are verified before they sell, products are checked before they go live, customers can pay on delivery and return with ease, and sellers are paid straight to their bank.</p>
            </div>
            <div className="mt-7 flex items-center gap-4">
              <span className="h-px w-12 bg-[#6A2CD6]/40" />
              <div><p className="font-[cursive] text-2xl text-[#2A0E5F]">{FOUNDER.name}</p><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{FOUNDER.title}</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* Promise */}
      <section className="bg-canvas">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EF5A8A]">The LOIMART promise</p>
            <h2 className="mt-2 text-[28px] font-bold tracking-[-0.02em] text-[#2A0E5F] sm:text-[36px]">What you can count on</h2>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROMISES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="azm-tilt rounded-3xl border border-[#E9DFFB] bg-gradient-to-br from-[#FBF8FF] to-white p-6 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_10px_30px_-18px_rgba(42,14,95,0.35)]">
                <span className="azm-icon3d grid h-12 w-12 place-items-center rounded-2xl text-white"><Icon size={22} /></span>
                <h3 className="mt-4 text-[17px] font-bold text-[#2A0E5F]">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EF5A8A]">How it works</p>
          <h2 className="mt-2 text-[28px] font-bold tracking-[-0.02em] text-[#2A0E5F] sm:text-[36px]">Shopping on LOIMART</h2>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="azm-tilt relative rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-[0_10px_30px_-18px_rgba(42,14,95,0.35)]">
              <span className="azm-num3d text-[48px] font-bold leading-none">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 text-[16px] font-bold text-[#2A0E5F]">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Sellers */}
      <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-8 sm:pb-20">
        <div className="relative grid gap-8 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2A0E5F] via-[#4A1FA8] to-[#6A2CD6] p-7 text-white shadow-[0_40px_80px_-30px_rgba(42,14,95,0.7)] sm:p-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#EF5A8A]/30 blur-3xl" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F9CB5B]">For sellers</p>
            <h2 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] sm:text-[36px]">Grow your business across India</h2>
            <p className="mt-3 max-w-xl text-[15.5px] leading-7 text-white/80">Whether you make it, grow it or stock it, LOIMART helps you reach customers all over India, without the hassle.</p>
            <a href={SELLER_URL + "/register"} className="mt-6 inline-flex rounded-full bg-[#F9CB5B] px-6 py-3 text-sm font-bold text-[#1B0840] transition hover:bg-[#ffd877]">Register as a seller</a>
          </div>
          <ul className="space-y-3 text-[15px]">
            {[
              `No commission for your first ${COMMISSION_FREE_MONTHS} months`,
              `Payouts to your bank ${PAYOUT_HOLD_DAYS} days after delivery`,
              "LOIMART books the courier and it picks up from you",
              "Easy listing: one product or hundreds with bulk upload",
              "Live help from our seller support team",
            ].map((t) => (
              <li key={t} className="azm-tilt flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur shadow-[0_12px_30px_-18px_rgba(0,0,0,0.6)]"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#F9CB5B] text-[#1B0840]"><CheckIcon size={13} /></span>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14 text-center sm:px-8 sm:py-16">
          <h2 className="text-[26px] font-bold tracking-[-0.02em] text-[#2A0E5F] sm:text-[32px]">We&apos;re here to help</h2>
          <p className="mt-3 text-[15.5px] leading-7 text-slate-600">
            Questions about an order, a return or selling on LOIMART? Talk to us.
            {SUPPORT_EMAIL ? <> Write to <a href={"mailto:" + SUPPORT_EMAIL} className="font-semibold text-[#6A2CD6] underline underline-offset-2">{SUPPORT_EMAIL}</a>.</> : null}
            {SUPPORT_PHONE ? <> Call <a href={"tel:" + SUPPORT_PHONE.replace(/\s/g, "")} className="font-semibold text-[#6A2CD6] underline underline-offset-2">{SUPPORT_PHONE}</a>.</> : null}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <OpenHelpChatButton mode="live" className="inline-flex items-center gap-2 rounded-full bg-[#6A2CD6] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5622b8]"><span className="h-2 w-2 rounded-full bg-[#22c55e]" aria-hidden />Chat with us live</OpenHelpChatButton>
            <Link href="/account" className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-[#6A2CD6]">My orders</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
