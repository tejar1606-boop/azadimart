"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import type { StoreChrome } from "../lib/chrome";
import { BagIcon, CloseIcon, HeartIcon, MenuIcon, SearchIcon, UserIcon } from "./icons";

/** Brand name in the tricolour palette: saffron "Azadi", India green "Mart". */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={"font-bold tracking-[-0.04em] " + className}><span className="text-brand">Azadi</span><span className="text-india">Mart</span></span>;
}

/** Thin saffron · white · green ribbon used on the header, banner and footer (colours only, not the flag). */
export function TricolourRibbon({ className = "h-1" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={"flex w-full " + className}>
      <span className="flex-1 bg-tiranga-saffron" />
      <span className="flex-1 bg-tiranga-white" />
      <span className="flex-1 bg-tiranga-green" />
    </div>
  );
}

function AnnouncementBar({ messages }: { messages: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % messages.length), 5000);
    return () => window.clearInterval(timer);
  }, [messages.length]);
  return (
    <div className="bg-navy px-4 py-2 text-center text-[11px] font-medium tracking-[0.04em] text-white sm:text-xs" aria-live="polite">
      <span className="mr-2 text-tiranga-saffron" aria-hidden="true">✦</span>{messages[index]}<span className="ml-2 text-[#5fd35a]" aria-hidden="true">✦</span>
    </div>
  );
}

function SearchForm({ className = "", autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? "/products?q=" + encodeURIComponent(q) : "/products");
  }
  return (
    <form role="search" onSubmit={submit} className={"relative " + className}>
      <label htmlFor={autoFocus ? "mobile-search" : "site-search"} className="sr-only">Search products</label>
      <input
        id={autoFocus ? "mobile-search" : "site-search"}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search for products, brands and more"
        className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:bg-white"
      />
      <SearchIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
    </form>
  );
}

export default function SiteHeader({ chrome }: { chrome: StoreChrome }) {
  const pathname = usePathname();
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/v1/cart", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json();
      setCartCount(Number(body.itemCount) || 0);
    }).catch(() => undefined);
  }, [pathname]);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const iconButton = "relative grid h-10 w-10 place-items-center rounded-full text-slate-900 transition hover:bg-slate-100";

  return (
    <>
      <TricolourRibbon />
      <AnnouncementBar messages={chrome.announcements} />
      <header className="sticky top-0 z-40 bg-white shadow-header">
        {/* Full-width bar like Meesho and Flipkart: logo pinned left, search right after it, account and cart at the far right. */}
        <div className="flex h-16 items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:h-[72px] lg:gap-8 lg:px-10 2xl:px-14">
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={() => setMenuOpen(true)} className={iconButton + " -ml-2 mr-1 lg:hidden"} aria-label="Open menu">
              <MenuIcon />
            </button>
            <Link href="/" className="text-[22px] leading-none lg:text-[26px]" aria-label="AzadiMart home"><Wordmark /></Link>
          </div>
          <SearchForm className="hidden w-full max-w-2xl md:block" />
          <nav aria-label="Account" className="ml-auto flex items-center justify-end gap-0.5 sm:gap-1">
            <Link href="/account" className="relative flex h-10 min-w-10 items-center justify-center gap-2 rounded-full text-slate-900 transition hover:bg-slate-100 lg:px-3" aria-label="Account">
              <UserIcon /><span className="hidden text-sm font-medium lg:inline">Account</span>
            </Link>
            <Link href="/wishlist" className={iconButton} aria-label="Wishlist"><HeartIcon /></Link>
            <Link href="/cart" className={iconButton} aria-label={cartCount ? `Cart, ${cartCount} items` : "Cart"}>
              <BagIcon />
              {cartCount > 0 ? <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">{cartCount > 99 ? "99+" : cartCount}</span> : null}
            </Link>
          </nav>
        </div>
        <div className="border-t border-slate-100 px-4 pb-3 pt-2 md:hidden"><SearchForm autoFocus /></div>
        {chrome.navigation.length ? (
          <nav aria-label="Categories" className="hidden border-t border-slate-100 lg:block">
            <div className="flex items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-7 2xl:px-11">
              <Link href="/products" className={"relative shrink-0 px-3 py-3 text-[13px] font-semibold uppercase tracking-[0.06em] transition " + (pathname === "/products" ? "text-brand-600 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand" : "text-navy hover:text-brand-600")}>All products</Link>
              {chrome.navigation.map((item) => (
                <Link key={item.href + item.label} href={item.href} className={"relative shrink-0 px-3 py-3 text-[13px] font-medium uppercase tracking-[0.06em] transition " + (pathname === item.href ? "text-brand-600 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand" : "text-slate-700 hover:text-brand-600")}>{item.label}</Link>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-white shadow-lift">
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
              <Wordmark className="text-xl" />
              <button type="button" onClick={() => setMenuOpen(false)} className={iconButton} aria-label="Close menu"><CloseIcon /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">
              <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Shop</p>
              <Link href="/products" className="block rounded-lg px-3 py-3 text-[15px] font-medium hover:bg-slate-50">All products</Link>
              {(chrome.categories.length ? chrome.categories.map((c) => ({ label: c.name, href: c.href })) : chrome.navigation).map((item) => (
                <Link key={item.href + item.label} href={item.href} className="block rounded-lg px-3 py-3 text-[15px] font-medium hover:bg-slate-50">{item.label}</Link>
              ))}
              <p className="mt-4 px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Your account</p>
              {([["My orders", "/account"], ["Wishlist", "/wishlist"], ["Cart", "/cart"], ["Sign in", "/login"]] as const).map(([label, href]) => (
                <Link key={href} href={href} className="block rounded-lg px-3 py-3 text-[15px] font-medium hover:bg-slate-50">{label}</Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
