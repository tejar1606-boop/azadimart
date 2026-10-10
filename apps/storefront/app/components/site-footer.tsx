import Link from "next/link";
import type { StoreChrome } from "../lib/chrome";
import { BadgeIcon, CashIcon, ReturnIcon, ShieldIcon } from "./icons";
import FooterBackdrop from "./footer-backdrop";
import IndiaFlag from "./india-flag";
import { TricolourRibbon } from "./site-header";

const SELLER_URL = process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.azadimart.com";
// Customer support contact, shown once set (Vercel / .env).
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "";

// Icon tints cycle through the tricolour palette: saffron, navy, green.
const PROMISES = [
  { icon: BadgeIcon, title: "Verified sellers", text: "Every seller is KYC-verified", tint: "bg-brand-50 text-brand-600" },
  { icon: ShieldIcon, title: "Quality checked", text: "Products reviewed before listing", tint: "bg-india-light text-india" },
  { icon: CashIcon, title: "Cash on Delivery", text: "Pay when your order arrives", tint: "bg-navy/5 text-navy" },
  { icon: ReturnIcon, title: "Easy returns", text: "7-day returns on eligible items", tint: "bg-brand-50 text-brand-600" },
];

export default function SiteFooter({ chrome }: { chrome: StoreChrome }) {
  const shopLinks = [{ label: "All products", href: "/products" }, ...chrome.categories.slice(0, 5).map((c) => ({ label: c.name, href: c.href }))];
  return (
    <footer className="mt-12 pb-20 lg:pb-0">
      <section aria-label="Our promise" className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-y-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, title, text, tint }) => (
            <div key={title} className="flex items-start gap-3 pr-2">
              <span className={"grid h-11 w-11 shrink-0 place-items-center rounded-full " + tint}><Icon size={22} /></span>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <TricolourRibbon />
      {/* Editorial footer: cinematic flag footage behind, big wordmark, plain links, brand story, legal line. */}
      <div className="relative overflow-hidden bg-[#060b1a] text-white">
        <FooterBackdrop />
        <div className="relative mx-auto max-w-[1440px] px-5 pb-8 pt-14 sm:px-8 lg:px-20 lg:pt-20">
          <div className="grid gap-12 lg:grid-cols-[1.25fr_1fr_1.35fr_1.15fr] lg:gap-10">
            <Link href="/" aria-label="AzadiMart home" className="block text-[44px] font-bold leading-none tracking-[-0.04em] sm:text-[56px]"><span className="text-[#FF9933]">Azadi</span><span className="text-[#4cc94a]">Mart</span></Link>

            <div className="text-[15px] leading-6 text-white/85">
              <p className="font-semibold text-white">Need assistance?</p>
              {SUPPORT_EMAIL || SUPPORT_PHONE ? (
                <p className="mt-1">
                  {SUPPORT_EMAIL ? <>Write to us at <a href={"mailto:" + SUPPORT_EMAIL} className="font-semibold text-white underline underline-offset-2">{SUPPORT_EMAIL}</a></> : null}
                  {SUPPORT_EMAIL && SUPPORT_PHONE ? " or call " : null}
                  {SUPPORT_PHONE ? <a href={"tel:" + SUPPORT_PHONE.replace(/\s/g, "")} className="font-semibold text-white underline underline-offset-2">{SUPPORT_PHONE}</a> : null}.
                </p>
              ) : null}
              <p className="mt-1">Track, cancel or return an order from <Link href="/account" className="font-semibold text-white underline underline-offset-2">My orders</Link>. Pay by Cash on Delivery, with easy 7-day returns.</p>
              <p className="mt-5"><span className="font-semibold text-white/90">Want to sell on AzadiMart?</span> <a href={SELLER_URL + "/register"} className="font-semibold text-white underline underline-offset-2">Register as a seller</a> or <a href={SELLER_URL + "/login"} className="font-semibold text-white underline underline-offset-2">sign in</a>.</p>
            </div>

            <nav aria-label="Footer" className="grid grid-cols-2 content-start gap-x-8 gap-y-4 text-[15px] text-white/80">
              {[...shopLinks, { label: "My orders", href: "/account" }, { label: "Wishlist", href: "/wishlist" }, { label: "Cart", href: "/cart" }, { label: "Sign in", href: "/login" }].map((link) => (
                <Link key={link.href + link.label} href={link.href} className="transition hover:text-white">{link.label}</Link>
              ))}
            </nav>

            <div className="text-[15px] leading-6 text-white/80">
              <p className="font-semibold text-white">#ShopIndia</p>
              <p className="mt-1">We believe the best of India is made by people you can trust: weavers, cooks, makers and small businesses in every corner of the country.</p>
              <p className="mt-4">AzadiMart gives them a fair, modern shop window. Every seller is KYC-verified and every product is quality-checked, so you can shop with confidence and pay when it arrives.</p>
              <p className="mt-4">Shop India. Support Indian sellers.</p>
            </div>
          </div>

          <div className="mt-16 flex items-center gap-4 lg:mt-24">
            <IndiaFlag width={60} />
            <div className="text-[15px] leading-6 text-white/85">
              <p className="font-semibold text-white">Proudly made in India</p>
              <p className="text-white/70">KYC-verified sellers · Quality-checked products · Cash on Delivery</p>
            </div>
          </div>

          <div className="mt-10 border-t border-white/25 pt-6 text-[15px] text-white/75">© {new Date().getFullYear()} AzadiMart. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}

