import Link from "next/link";
import type { StoreChrome } from "../lib/chrome";
import FooterAccountLink from "./footer-account-link";
import FooterBackdrop from "./footer-backdrop";
import { BRAND_TAGLINE, OpenHelpChatButton } from "@azadimart/ui";
import { TricolourRibbon, Wordmark } from "./site-header";

const SELLER_URL = process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.loimart.com";
// Customer support contact, shown once set (Vercel / .env).
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "";

export default function SiteFooter({ chrome }: { chrome: StoreChrome }) {
  const shopLinks = [{ label: "All products", href: "/products" }, ...chrome.categories.slice(0, 5).map((c) => ({ label: c.name, href: c.href }))];
  return (
    <footer className="mt-12 pb-20 lg:pb-0">
      <TricolourRibbon />
      {/* Editorial footer: cinematic flag footage behind, big wordmark, plain links, brand story, legal line. */}
      <div className="relative overflow-hidden bg-[#2A0E5F] text-white">
        <FooterBackdrop />
        <div className="relative mx-auto max-w-[1440px] px-5 pb-8 pt-14 sm:px-8 lg:px-20 lg:pt-20">
          <div className="grid gap-12 lg:grid-cols-[1.25fr_1fr_1.35fr_1.15fr] lg:gap-10">
            <div><Link href="/" aria-label="LOIMART home" className="block text-[40px] leading-none sm:text-[52px]"><Wordmark onDark /></Link><p className="mt-3 text-[15px] tracking-[0.02em] text-white/60">{BRAND_TAGLINE}</p></div>

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
              <OpenHelpChatButton mode="live" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:bg-brand-50"><span className="h-2 w-2 rounded-full bg-[#22c55e]" aria-hidden />Chat with us live</OpenHelpChatButton>
              <p className="mt-5"><span className="font-semibold text-white/90">Want to sell on LOIMART?</span> <a href={SELLER_URL + "/register"} className="font-semibold text-white underline underline-offset-2">Register as a seller</a> or <a href={SELLER_URL + "/login"} className="font-semibold text-white underline underline-offset-2">sign in</a>.</p>
            </div>

            <nav aria-label="Footer" className="grid grid-cols-2 content-start gap-x-8 gap-y-4 text-[15px] text-white/80">
              {[...shopLinks, { label: "About us", href: "/about" }, { label: "My orders", href: "/account" }, { label: "Wishlist", href: "/wishlist" }, { label: "Cart", href: "/cart" }].map((link) => (
                <Link key={link.href + link.label} href={link.href} className="transition hover:text-white">{link.label}</Link>
              ))}
              <FooterAccountLink className="transition hover:text-white" />
            </nav>

            <div className="text-[15px] leading-6 text-white/80">
              <p className="font-semibold text-white">#ShopIndia</p>
              <p className="mt-1">We believe the best of India is made by people you can trust: weavers, cooks, makers and small businesses in every corner of the country.</p>
              <p className="mt-4">LOIMART gives them a fair, modern shop window. Every seller is KYC-verified and every product is quality-checked, so you can shop with confidence and pay when it arrives.</p>
              <p className="mt-4">Shop India. Support Indian sellers.</p>
              <Link href="/about" className="mt-4 inline-flex items-center gap-1 font-semibold text-white underline underline-offset-2">Read our story →</Link>
            </div>
          </div>

          <div className="mt-16 flex flex-col gap-3 border-t border-white/25 pt-6 text-[15px] text-white/75 sm:flex-row sm:items-center sm:justify-between lg:mt-24">
            <span>© {new Date().getFullYear()} LOIMART. All rights reserved.</span>
            <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/about" className="transition hover:text-white">About us</Link>
              <Link href="/terms" className="transition hover:text-white">Terms &amp; Conditions</Link>
              <Link href="/privacy" className="transition hover:text-white">Privacy Policy</Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}

