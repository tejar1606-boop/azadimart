import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCategoryRail } from "../lib/category-rail";
import CountUp from "./count-up";
import { PAYOUT_HOLD_DAYS } from "@azadimart/shared";
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

/** The founder's story, in his own words (from his career; no private contact details). */
const FOUNDER_STORY = [
  "I didn't begin with investors or a big office. I began on the other end of the phone.",
  "I'm from Visakhapatnam, and for more than eight years my work has been the same at heart: being there for people when something goes wrong. On a ride-hailing safety response team, I took the urgent calls, and learned that behind every case number is a real person, frightened and waiting for someone to care.",
  "For four years I stood beside small shop owners, helping them with billing machines, stock and payments, where one mistake could cost a family a day's earnings. I saw how hard they worked, and how little the big systems were built for them.",
  "I protected an online community of mothers and parents from harmful content, because I learned that trust is the most precious thing a platform has, and once broken it rarely comes back. Through all of it, I studied for my degree in Fine Arts in the evenings and on weekends, because I believed that growth doesn't wait for perfect conditions.",
  "Most recently I managed online stores for travel brands, every price, photo and detail that shoppers depend on. And I kept seeing the same gap: big brands sell online with ease, while the talented seller down the road still struggles to be seen. That gap stayed with me. LOIMART is my answer to it.",
  "So I built the marketplace I always wished existed. Sellers are verified before they sell. Every product is checked before it goes live. You can pay when it arrives and return it easily. Sellers are paid straight to their bank. And when you need help, a real person answers, because I have been that person for eight years, and I know how much it matters.",
];
/** Milestones from the founder's career. */
const FOUNDER_JOURNEY = [
  { year: "2017", title: "Where it started", text: "Safety and emergency support, and caring for creators on a fast-growing video platform." },
  { year: "2019", title: "Beside India's shopkeepers", text: "Four years leading customer support for retail stores: billing, stock and the daily realities of small business." },
  { year: "2022", title: "A degree, earned the hard way", text: "Fine Arts, Andhra University, studied while working full time." },
  { year: "2024", title: "Solving problems at scale", text: "Senior technical specialist, cutting query resolution time by 98%." },
  { year: "2026", title: "LOIMART", text: "Everything learned, put into one promise: a fair marketplace India can trust." },
];

/** Founder card. Name and title as they should appear on the page. */
const FOUNDER = { name: "Surisetty Raviteja", title: "CEO & Director, LOIMART", photo: "/about/founder-portrait.webp" };

/** Milestone shown on the page (update as LOIMART grows). */
const MILESTONE = { count: 10000, suffix: "+", value: "10,000+", label: "orders in just 1 month", note: "Thank you, India, for trusting LOIMART and our sellers." };

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
            <p className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#F9CB5B]/30 bg-[#F9CB5B]/10 px-4 py-2 text-sm text-white/85"><span aria-hidden>🎉</span><b className="text-[#F9CB5B]">{MILESTONE.value}</b> {MILESTONE.label}</p>
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

      {/* Milestone */}
      <section className="relative z-10 mx-auto -mt-8 max-w-5xl px-5 sm:-mt-12 sm:px-8">
        <div className="azm-milestone relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#F9CB5B] via-[#FFB38A] to-[#EF5A8A] p-[2px] shadow-[0_30px_60px_-28px_rgba(239,90,138,0.65)]">
          <div className="flex flex-col items-center gap-4 rounded-[calc(2rem-2px)] bg-white px-6 py-7 text-center sm:flex-row sm:justify-between sm:px-10 sm:text-left">
            <div className="flex items-center gap-5">
              <span className="azm-icon3d grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl" aria-hidden>🏆</span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EF5A8A]">Milestone</p>
                <CountUp to={MILESTONE.count} suffix={MILESTONE.suffix} className="azm-count3d mt-1 block text-[52px] font-black leading-none tracking-[-0.03em] sm:text-[68px]" />
                <p className="mt-2 text-[18px] font-bold text-[#2A0E5F] sm:text-[22px]">{MILESTONE.label}</p>
              </div>
            </div>
            <p className="max-w-xs text-sm leading-6 text-slate-600">{MILESTONE.note}</p>
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
            <h2 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#2A0E5F] sm:text-[38px]">From the other end of the phone, to building LOIMART</h2>
            <blockquote className="relative mt-6 rounded-3xl bg-gradient-to-br from-[#FBF8FF] to-white p-6 ring-1 ring-[#E9DFFB] sm:p-8">
              <span aria-hidden className="absolute -top-5 left-6 font-serif text-[80px] leading-none text-[#6A2CD6]/25">&ldquo;</span>
              <p className="relative text-[17px] font-medium leading-8 text-[#2A0E5F] sm:text-[19px]">Every great product has a person behind it. LOIMART exists so that the seller in a small town gets the same chance as a big brand, and every shopper can buy from them with complete confidence.</p>
            </blockquote>
            <div className="mt-6 space-y-4 text-[15.5px] leading-7 text-slate-600">
              {FOUNDER_STORY.map((para, i) => <p key={i} className={i === 0 ? "text-[17px] font-semibold leading-8 text-[#2A0E5F]" : undefined}>{para}</p>)}
              <p>Today, LOIMART has crossed <b className="text-[#2A0E5F]">{MILESTONE.value} {MILESTONE.label}</b>. Every one of them is a small promise kept.</p>
            </div>
            <ol className="mt-8 grid gap-3 sm:grid-cols-2">
              {FOUNDER_JOURNEY.map((step) => (
                <li key={step.year + step.title} className="rounded-2xl border border-[#E9DFFB] bg-[#FBF8FF] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#EF5A8A]">{step.year}</p>
                  <p className="mt-1 font-semibold text-[#2A0E5F]">{step.title}</p>
                  <p className="mt-1 text-[13.5px] leading-6 text-slate-600">{step.text}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-[16px] font-medium italic leading-8 text-[#2A0E5F]">If you are a seller carrying a dream, or a shopper looking for something real, welcome. This place was built for you.</p>
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
              "0% commission on every order",
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
            <OpenHelpChatButton mode="live" className="inline-flex items-center gap-2 rounded-full bg-[#6A2CD6] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5622b8]"><span className="h-2 w-2 rounded-full bg-[#22c55e]" aria-hidden />Chat with us</OpenHelpChatButton>
            <Link href="/account" className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-[#6A2CD6]">My orders</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
