"use client";

import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";
import { PortalIcons, type PortalIconName } from "./portal-icons";

/** tone: optional colourful icon tile (seller portal); isNew: small "NEW" tag. */
export type PortalNavItem = { href: string; label: string; icon: PortalIconName; badge?: string; tone?: PortalTone; isNew?: boolean };
export type PortalTone = "saffron" | "green" | "sky" | "violet" | "rose" | "amber" | "teal" | "indigo" | "slate";
const TONE_TILE: Record<PortalTone, string> = {
  saffron: "bg-orange-400/15 text-orange-300", green: "bg-emerald-400/15 text-emerald-300", sky: "bg-sky-400/15 text-sky-300",
  violet: "bg-violet-400/15 text-violet-300", rose: "bg-rose-400/15 text-rose-300", amber: "bg-amber-400/15 text-amber-300",
  teal: "bg-teal-400/15 text-teal-300", indigo: "bg-indigo-400/15 text-indigo-300", slate: "bg-white/10 text-white/70",
};
export type PortalNavSection = { title?: string; items: PortalNavItem[] };

type LinkProps = { href: string; className?: string; children: ReactNode; onClick?: () => void; "aria-current"?: "page" };

/**
 * Seller centre / admin console layout: dark grouped sidebar on desktop, top
 * bar with a slide-in menu on mobile. Framework-agnostic: the app passes its
 * router Link component and the current pathname.
 */
export function PortalShell({
  product,
  sections,
  pathname,
  Link,
  onSignOut,
  footer,
  header,
  quickActions,
  brandFooter = false,
  children,
}: {
  /** e.g. "Seller Centre" or "Admin" */
  product: string;
  sections: PortalNavSection[];
  pathname: string;
  Link: ComponentType<LinkProps>;
  onSignOut: () => void;
  footer?: ReactNode;
  /** Replaces the AzadiMart mark at the top of the sidebar (e.g. the seller's store card). */
  header?: ReactNode;
  /** Small buttons under the header (e.g. Notices, Help). */
  quickActions?: ReactNode;
  /** Show the AzadiMart wordmark above Sign out (used when `header` replaces it). */
  brandFooter?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  // Keep the current page's link visible in a long sidebar.
  useEffect(() => { sidebar.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" }); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // The most specific matching link wins, so /catalog/arrange highlights "Arrange" rather than "/catalog" too.
  const matches = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const current = sections.flatMap((section) => section.items).filter((item) => matches(item.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const isActive = (href: string) => current?.href === href;

  const nav = (
    <nav aria-label={product} className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {sections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title ? <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{section.title}</p> : null}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = PortalIcons[item.icon];
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={"group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition " + (active ? "bg-white text-chrome shadow-sm" : "text-white/70 hover:bg-white/[0.07] hover:text-white")}
                  >
                    {item.tone ? (
                      <span className={"grid h-7 w-7 shrink-0 place-items-center rounded-lg " + (active ? "bg-brand-50 text-brand-600" : TONE_TILE[item.tone])}><Icon size={16} /></span>
                    ) : (
                      <Icon size={19} className={active ? "text-brand-600" : "text-white/45 group-hover:text-white/80"} />
                    )}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.isNew ? <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">New</span> : null}
                    {item.badge ? <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + (active ? "bg-brand text-white" : "bg-brand/90 text-white")}>{item.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brandMark = (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-sm font-bold text-white">A</span>
      <div className="leading-tight">
        <p className="text-[15px] font-bold tracking-[-0.03em] text-white">Azadi<span className="text-brand-400">Mart</span></p>
        <p className="text-[11px] font-medium text-white/45">{product}</p>
      </div>
    </div>
  );

  const signOut = (
    <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/[0.07] hover:text-white">
      <PortalIcons.logout size={19} className="text-white/45" />Sign out
    </button>
  );

  return (
    <div className="min-h-screen bg-panel lg:flex">
      {/* Desktop sidebar */}
      <aside ref={sidebar} className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-chrome lg:flex">
        <div className={header ? "px-3 pb-3 pt-4" : "px-6 py-5"}>{header ?? brandMark}</div>
        {quickActions ? <div className="px-3 pb-4">{quickActions}</div> : null}
        {nav}
        <div className="border-t border-chrome-line px-3 py-3">{footer}{brandFooter ? <div className="px-3 pb-2 pt-1 opacity-70">{brandMark}</div> : null}{signOut}</div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-chrome px-4 text-white lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="-ml-1 grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10"><PortalIcons.menu /></button>
        <p className="text-[15px] font-bold tracking-[-0.03em]">Azadi<span className="text-brand-400">Mart</span><span className="ml-2 text-xs font-medium text-white/50">{product}</span></p>
        {current ? <span className="ml-auto truncate text-xs text-white/60">{current.label}</span> : null}
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-chrome">
            <div className="flex items-start justify-between gap-2 px-3 py-4"><div className="min-w-0 flex-1">{header ?? <div className="px-2">{brandMark}</div>}</div><button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white hover:bg-white/10"><PortalIcons.close /></button></div>
            {quickActions ? <div className="px-3 pb-4">{quickActions}</div> : null}
            {nav}
            <div className="border-t border-chrome-line px-3 py-3">{footer}{brandFooter ? <div className="px-3 pb-2 pt-1 opacity-70">{brandMark}</div> : null}{signOut}</div>
          </aside>
        </div>
      ) : null}

      {/* On very wide screens content stops at 1600px and stays centred beside the sidebar. */}
      <div className="min-w-0 flex-1"><div className="mx-auto w-full max-w-[1600px]">{children}</div></div>
    </div>
  );
}

/** Consistent page heading for portal screens. */
export function PortalPageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Stat tile for dashboards. */
export function StatCard({ label, value, hint, icon, tone = "default", href, Link }: { label: string; value: string; hint?: string; icon?: PortalIconName; tone?: "default" | "brand" | "warn" | "good"; href?: string; Link?: ComponentType<LinkProps> }) {
  const Icon = icon ? PortalIcons[icon] : null;
  const toneClass = { default: "bg-slate-100 text-slate-600", brand: "bg-brand-50 text-brand-600", warn: "bg-amber-50 text-amber-700", good: "bg-india-light text-india" }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        {Icon ? <span className={"grid h-9 w-9 place-items-center rounded-xl " + toneClass}><Icon size={18} /></span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[28px]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </>
  );
  const className = "block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition";
  return href && Link ? <Link href={href} className={className + " hover:-translate-y-0.5 hover:shadow-lift"}>{body}</Link> : <div className={className}>{body}</div>;
}

/** Friendly placeholder for sections that are planned but not built yet. */
export function ComingSoon({ title, description, icon = "sparkle", points = [] }: { title: string; description: string; icon?: PortalIconName; points?: string[] }) {
  const Icon = PortalIcons[icon];
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-card sm:px-10">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Icon size={26} /></span>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">Coming soon</p>
      <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
      {points.length ? (
        <ul className="mx-auto mt-6 grid max-w-lg gap-2 text-left sm:grid-cols-2">
          {points.map((point) => <li key={point} className="flex items-center gap-2 rounded-xl bg-panel px-3 py-2 text-sm text-slate-700"><span className="h-1.5 w-1.5 rounded-full bg-brand" />{point}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/** Sign-in / sign-up layout for the seller centre and admin console. */
export function PortalAuthLayout({ product, headline, points, children }: { product: string; headline: string; points: string[]; children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-panel lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-chrome p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-india/25 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-base font-bold">A</span>
          <div className="leading-tight"><p className="text-lg font-bold tracking-[-0.03em]">Azadi<span className="text-brand-400">Mart</span></p><p className="text-xs text-white/50">{product}</p></div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.04em]">{headline}</h1>
          <ul className="mt-8 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-3 text-sm text-white/75">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-brand-400"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>{point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} AzadiMart</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-sm font-bold text-white">A</span>
            <p className="text-lg font-bold tracking-[-0.03em]">Azadi<span className="text-brand-600">Mart</span> <span className="text-sm font-medium text-slate-500">{product}</span></p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
