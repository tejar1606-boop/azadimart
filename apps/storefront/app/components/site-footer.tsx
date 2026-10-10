import Link from "next/link";
import type { StoreChrome } from "../lib/chrome";
import { BadgeIcon, CashIcon, LockIcon, ReturnIcon, ShieldIcon } from "./icons";
import FooterBackdrop from "./footer-backdrop";
import { TricolourRibbon } from "./site-header";

const SELLER_URL = process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.azadimart.com";
// Customer support contact, shown once set (Vercel / .env).
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "";

// Footer trust markers: only promises AzadiMart keeps today.
const TRUST = [
  { icon: BadgeIcon, title: "KYC-verified sellers", text: "Every seller checked" },
  { icon: ShieldIcon, title: "Quality-checked", text: "Reviewed before listing" },
  { icon: CashIcon, title: "Cash on Delivery", text: "Pay when it arrives" },
  { icon: ReturnIcon, title: "Easy 7-day returns", text: "On eligible items" },
  { icon: LockIcon, title: "Secure checkout", text: "Your data protected" },
];

export default function SiteFooter({ chrome }: { chrome: StoreChrome }) {
  const shopLinks = [{ label: "All products", href: "/products" }, ...chrome.categories.slice(0, 5).map((c) => ({ label: c.name, href: c.href }))];
  return (
    <footer className="mt-12 pb-20 lg:pb-0">
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

          {/* Trust markers */}
          <ul aria-label="Why shop with AzadiMart" className="mt-16 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-24 lg:grid-cols-5">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-center gap-2.5 last:col-span-2 sm:last:col-span-1 rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2.5 backdrop-blur-sm sm:gap-3 sm:px-4 sm:py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[#ffb366] sm:h-10 sm:w-10"><Icon size={18} /></span>
                <span className="min-w-0 leading-tight"><span className="block text-[13px] font-semibold text-white sm:text-sm">{title}</span><span className="hidden text-xs text-white/65 sm:block">{text}</span></span>
              </li>
            ))}
          </ul>

          <div className="mt-10 border-t border-white/25 pt-6 text-[15px] text-white/75">© {new Date().getFullYear()} AzadiMart. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}

