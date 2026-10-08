"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function MarketplaceHeader({ announcement, navigationItems }: { announcement: string; navigationItems: Array<{ id: string; label: string; href: string | null }> }) {
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    fetch("/api/v1/cart", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json();
      setCartCount(Number(body.itemCount) || 0);
    }).catch(() => undefined);
  }, []);

  return <>
    <div className="bg-slate-950 px-4 py-2 text-center text-[11px] font-medium tracking-wide text-white/80">{announcement}</div>
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:gap-6">
        <Link href="/" className="shrink-0 text-xl font-black tracking-[-0.04em]">Azadi<span className="text-amber-500">Mart</span></Link>
        <nav className="hidden min-w-0 flex-1 items-center gap-5 lg:flex">
          {navigationItems.map((item) => <Link key={item.id} href={item.href ?? "/"} className="text-sm font-medium text-slate-600 transition hover:text-slate-950">{item.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Link href="/products" className="hidden min-w-56 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs text-slate-400 transition hover:border-slate-300 sm:block">Search for products, categories and brands</Link>
          <Link href="/wishlist" aria-label="Wishlist" className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-lg text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">♡</Link>
          <Link href="/account" aria-label="Account" className="hidden h-10 items-center rounded-full border border-slate-200 px-3 text-xs font-bold text-slate-700 sm:flex">Account</Link>
          <Link href="/cart" aria-label={cartCount ? `Cart, ${cartCount} items` : "Cart"} className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-base transition hover:border-slate-300 hover:bg-slate-50">🛒{cartCount > 0 ? <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-slate-950">{cartCount > 99 ? "99+" : cartCount}</span> : null}</Link>
          <Link href="/products" className="rounded-full bg-slate-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 sm:px-5">Shop</Link>
        </div>
      </div>
      <div className="border-t border-slate-100 bg-white px-4 pb-2.5 pt-2 lg:hidden">
        <div className="mx-auto mb-2 flex max-w-7xl rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <Link href="/products" className="w-full text-xs text-slate-400">Search for products, categories and brands</Link>
        </div>
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
          {navigationItems.map((item) => <Link key={"mobile-" + item.id} href={item.href ?? "/"} className="shrink-0 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600">{item.label}</Link>)}
        </div>
      </div>
    </header>
  </>;
}