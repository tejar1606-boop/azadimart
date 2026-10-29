"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BagIcon, GridIcon, HeartIcon, HomeIcon, UserIcon } from "./icons";

const TABS = [
  { label: "Home", href: "/", icon: HomeIcon },
  { label: "Shop", href: "/products", icon: GridIcon },
  { label: "Wishlist", href: "/wishlist", icon: HeartIcon },
  { label: "Cart", href: "/cart", icon: BagIcon },
  { label: "Account", href: "/account", icon: UserIcon },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  if (pathname.startsWith("/checkout")) return null;
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map(({ label, href, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={"flex flex-col items-center gap-1 py-2 text-[10px] font-medium " + (active ? "text-brand-600" : "text-slate-500")}>
              <Icon size={22} />{label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
