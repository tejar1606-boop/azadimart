import Link from "next/link";
import type { StoreChrome } from "../lib/chrome";
import { BadgeIcon, CashIcon, ReturnIcon, ShieldIcon } from "./icons";
import { TricolourRibbon, Wordmark } from "./site-header";

const SELLER_URL = process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.azadimart.com";

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
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
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
      <div className="relative overflow-hidden bg-navy-deep text-white">
        {/* Soft saffron and green glows echo the tricolour without using the flag. */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-tiranga-saffron/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-tiranga-green/15 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="text-2xl" aria-label="AzadiMart home"><Wordmark /></Link>
            <p className="mt-3 max-w-xs text-sm leading-6 text-white/65">India&apos;s marketplace for verified sellers. Quality-checked products, delivered to your door.</p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85">
              <span className="flex h-2.5 w-6 overflow-hidden rounded-full" aria-hidden="true"><span className="flex-1 bg-tiranga-saffron" /><span className="flex-1 bg-white" /><span className="flex-1 bg-tiranga-green" /></span>
              Proudly made in India
            </p>
          </div>
          <FooterColumn title="Shop" links={shopLinks} />
          <FooterColumn title="Your account" links={[{ label: "My orders", href: "/account" }, { label: "Wishlist", href: "/wishlist" }, { label: "Cart", href: "/cart" }, { label: "Sign in", href: "/login" }]} />
          <FooterColumn title="Sell with us" links={[{ label: "Become a seller", href: SELLER_URL + "/register" }, { label: "Seller login", href: SELLER_URL + "/login" }]} />
        </div>
        <div className="relative border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>© {new Date().getFullYear()} AzadiMart. All rights reserved.</span>
            <span className="flex items-center gap-2">
              <span className="rounded border border-white/15 px-2 py-1 font-semibold text-white/75">Cash on Delivery</span>
              <span className="rounded border border-white/15 px-2 py-1 font-semibold text-white/75">UPI &amp; cards</span>
              <span className="rounded border border-white/15 px-2 py-1 font-semibold text-white/75">Secure checkout</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; href: string }> }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-tiranga-saffron/90">{title}</p>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.href + link.label}><Link href={link.href} className="text-sm text-white/80 transition hover:text-white">{link.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
