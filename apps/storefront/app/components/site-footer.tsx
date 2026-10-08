import Link from "next/link";
import type { StoreChrome } from "../lib/chrome";
import { BadgeIcon, CashIcon, ReturnIcon, ShieldIcon } from "./icons";
import { Wordmark } from "./site-header";

const SELLER_URL = process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.azadimart.com";

const PROMISES = [
  { icon: BadgeIcon, title: "Verified sellers", text: "Every seller is KYC-verified" },
  { icon: ShieldIcon, title: "Quality checked", text: "Products reviewed before listing" },
  { icon: CashIcon, title: "Cash on Delivery", text: "Pay when your order arrives" },
  { icon: ReturnIcon, title: "Easy returns", text: "7-day returns on eligible items" },
];

export default function SiteFooter({ chrome }: { chrome: StoreChrome }) {
  const shopLinks = [{ label: "All products", href: "/products" }, ...chrome.categories.slice(0, 5).map((c) => ({ label: c.name, href: c.href }))];
  return (
    <footer className="mt-12 pb-20 lg:pb-0">
      <section aria-label="Our promise" className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3 pr-2">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon size={22} /></span>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="bg-[#111111] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="text-2xl" aria-label="AzadiMart home"><Wordmark /></Link>
            <p className="mt-3 max-w-xs text-sm leading-6 text-white/60">India&apos;s marketplace for verified sellers. Quality-checked products, delivered to your door.</p>
          </div>
          <FooterColumn title="Shop" links={shopLinks} />
          <FooterColumn title="Your account" links={[{ label: "My orders", href: "/account" }, { label: "Wishlist", href: "/wishlist" }, { label: "Cart", href: "/cart" }, { label: "Sign in", href: "/login" }]} />
          <FooterColumn title="Sell with us" links={[{ label: "Become a seller", href: SELLER_URL + "/register" }, { label: "Seller login", href: SELLER_URL + "/login" }]} />
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>© {new Date().getFullYear()} AzadiMart. All rights reserved.</span>
            <span className="flex items-center gap-2">
              <span className="rounded border border-white/15 px-2 py-1 font-semibold text-white/70">Cash on Delivery</span>
              <span className="rounded border border-white/15 px-2 py-1 font-semibold text-white/70">Secure checkout</span>
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
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40">{title}</p>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.href + link.label}><Link href={link.href} className="text-sm text-white/80 transition hover:text-white">{link.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
