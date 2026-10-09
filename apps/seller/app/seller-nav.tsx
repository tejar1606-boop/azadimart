"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PortalIcons, PortalShell, type PortalNavSection } from "@azadimart/ui";
import { noticeCount, type SellerAttention } from "./lib/notices";

// Public pages render without the portal chrome.
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

export type SellerCounts = SellerAttention | null;

const badge = (n: number) => (n > 0 ? String(n > 99 ? "99+" : n) : undefined);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "S";
const STATUS: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: "Verified seller", tone: "text-emerald-300" },
  KYC_SUBMITTED: { label: "KYC under review", tone: "text-amber-300" },
  PENDING_APPROVAL: { label: "KYC under review", tone: "text-amber-300" },
  REJECTED: { label: "KYC needs changes", tone: "text-rose-300" },
  SUSPENDED: { label: "Account suspended", tone: "text-rose-300" },
};

/** Your store at the top of the sidebar: initials, name and verification status. */
function StoreCard({ counts }: { counts: SellerCounts }) {
  const name = counts?.storeName ?? "Your store";
  const status = STATUS[counts?.status ?? ""] ?? { label: "Complete your KYC", tone: "text-amber-300" };
  return (
    <Link href="/kyc" className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10 transition hover:bg-white/[0.1]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#ff9933] to-brand-600 text-sm font-bold text-white shadow-sm">{initials(name)}</span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-white">{name}</span>
        <span className={"flex items-center gap-1 text-[11px] font-medium " + status.tone}>
          {counts?.status === "ACTIVE" ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          {status.label}
        </span>
      </span>
    </Link>
  );
}

export default function SellerChrome({ counts, children }: { counts: SellerCounts; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  if (PUBLIC_PATHS.has(pathname)) return <>{children}</>;

  const notices = counts ? noticeCount(counts) : 0;
  const sections: PortalNavSection[] = [
    { items: [{ href: "/dashboard", label: "Home", icon: "dashboard", tone: "indigo" }] },
    { title: "Manage business", items: [
      { href: "/orders", label: "Orders", icon: "orders", tone: "saffron", badge: badge(counts?.toShip ?? 0) },
      { href: "/products", label: "Products", icon: "products", tone: "sky", badge: badge(counts?.needsWork ?? 0) },
      { href: "/inventory", label: "Inventory", icon: "inventory", tone: "violet", badge: badge(counts?.lowStock ?? 0) },
      { href: "/payouts", label: "Payments", icon: "payouts", tone: "green" },
      { href: "/shipping", label: "Shipping & pickup", icon: "shipping", tone: "amber" },
    ] },
    { title: "Grow sales", items: [
      { href: "/reviews", label: "Customer reviews", icon: "star", tone: "amber", badge: badge(counts?.newReviews ?? 0) },
      { href: "/products/new", label: "Add a product", icon: "sparkle", tone: "rose" },
    ] },
    { title: "Account", items: [
      { href: "/kyc", label: "KYC & business", icon: "kyc", tone: "teal" },
      { href: "/help", label: "Help & support", icon: "help", tone: "slate" },
    ] },
  ];

  const quick = "flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] py-2 text-xs font-semibold text-white/80 ring-1 ring-white/10 transition hover:bg-white/[0.1] hover:text-white";
  const quickActions = (
    <div className="flex gap-2">
      <Link href="/notices" className={quick + (pathname === "/notices" ? " bg-white/[0.14] text-white" : "")}>
        <PortalIcons.bell size={15} />Notices{notices ? <span className="rounded-full bg-brand px-1.5 text-[10px] text-white">{notices}</span> : null}
      </Link>
      <Link href="/help" className={quick + (pathname === "/help" ? " bg-white/[0.14] text-white" : "")}><PortalIcons.help size={15} />Help</Link>
    </div>
  );

  async function signOut() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); }
  }

  return (
    <PortalShell product="Seller Hub" sections={sections} pathname={pathname} Link={Link} onSignOut={() => void signOut()} header={<StoreCard counts={counts} />} quickActions={quickActions} brandFooter>
      {children}
    </PortalShell>
  );
}
