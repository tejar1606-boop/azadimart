import Link from "next/link";
import { PortalIcons } from "@azadimart/ui";
import { AdminScreen } from "../_components/admin-screen";

const TOOLS = [
  { href: "/marketing/coupons", eyebrow: "Promotions", title: "Coupons & discounts", text: "Create percentage, fixed-value and free-shipping coupon campaigns.", icon: PortalIcons.coupons },
  { href: "/online-store", eyebrow: "Merchandising", title: "Online Store", text: "Edit homepage sections, banners and videos, then publish.", icon: PortalIcons.store },
];

export default function Page() {
  return (
    <AdminScreen eyebrow="Storefront" title="Marketing" description="Campaigns, homepage merchandising and promotional offers.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map(({ href, eyebrow, title, text, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon size={20} /></span>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{eyebrow}</p>
            <h2 className="mt-1 text-lg font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm text-slate-500">{text}</p>
            <span className="mt-4 inline-block text-sm font-semibold text-brand-600 group-hover:underline">Open →</span>
          </Link>
        ))}
      </div>
    </AdminScreen>
  );
}
