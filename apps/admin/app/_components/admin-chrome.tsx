"use client";

import Link from "next/link";
import CallAlert from "./call-alert";
import LiveChatHeartbeat from "./live-chat-heartbeat";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PortalShell, type PortalNavSection } from "@azadimart/ui";
import { CONFIDENTIAL_PERMISSIONS, PAYROLL_URL, STAFF_PERMISSION_KEYS, STUDIO_URL, adminPagePermission, firstAdminPage } from "@azadimart/shared";

export type AdminCounts = { liveWaiting: number; role: string; roleName: string; displayName: string | null; permissions: string[]; support: number; sellers: number; qc: number; approvals: number; aplus: number; ads: number; walletTopUps: number };

const badge = (n: number) => (n > 0 ? String(n > 99 ? "99+" : n) : undefined);

export default function AdminChrome({ counts, children }: { counts: AdminCounts | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const permissions = counts?.permissions;
  const allowed = (href: string) => { const area = adminPagePermission(href); return !area || Boolean(permissions?.includes(area)); };
  // Pages outside the member's role go to their first allowed page (the APIs refuse them too).
  useEffect(() => {
    if (!permissions || pathname === "/login") return;
    const area = adminPagePermission(pathname);
    if (area && !permissions.includes(area)) router.replace(firstAdminPage(permissions));
  }, [permissions, pathname, router]);
  if (pathname === "/login" || !counts) return <>{children}</>;

  const supportItems: PortalNavSection["items"] = [
    { href: "/live-chat", label: "Live chat", icon: "support", badge: badge(counts.liveWaiting) },
    { href: "/support", label: "Support desk", icon: "support", badge: badge(counts.support) },
    { href: "/calls", label: "Call centre", icon: "support" },
    { href: "/support/replies", label: "Saved replies", icon: "support" },
  ];
  const all: PortalNavSection[] = [
    { items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }] },
    { title: "Sales", items: [
      { href: "/orders", label: "Orders", icon: "orders" },
      { href: "/abandoned-carts", label: "Abandoned carts", icon: "orders" },
      { href: "/payments", label: "Payments", icon: "payments" },
      { href: "/returns", label: "Returns", icon: "returns" },
      { href: "/customers", label: "Customers", icon: "customers" },
    ] },
    { title: "Catalogue", items: [
      { href: "/catalog", label: "All products", icon: "inventory" },
      { href: "/catalog/arrange", label: "Arrange products", icon: "arrange" },
      { href: "/catalog/categories", label: "Categories", icon: "categories" },
      { href: "/catalog/photos", label: "Category photos", icon: "categories" },
      { href: "/catalog/discount-changes", label: "Discount changes", icon: "coupons" },
      { href: "/catalog/gst", label: "GST & HSN", icon: "finance" },
      { href: "/products", label: "Product approvals", icon: "products", badge: badge(counts.approvals) },
      { href: "/qc", label: "Quality control", icon: "qc", badge: badge(counts.qc) },
      { href: "/aplus", label: "A+ review", icon: "aplus", badge: badge(counts.aplus) },
      { href: "/reviews", label: "Customer reviews", icon: "star" },
      { href: "/sellers", label: "Sellers & KYC", icon: "sellers", badge: badge(counts.sellers) },
    ] },
    { title: "Storefront", items: [
      { href: "/online-store", label: "Online Store", icon: "store" },
      // Banners live in the separate Banner Studio app.
      ...(permissions?.includes("banners") ? [{ href: STUDIO_URL, label: "Banner Studio ↗", icon: "sparkle" as const, badge: badge(counts.ads) }] : []),
      { href: "/marketing/coupons", label: "Coupons", icon: "coupons" },
      { href: "/marketing/offer-tags", label: "Offer tags", icon: "sparkle" },
      { href: "/marketing/wallet", label: "Wallet & referrals", icon: "payments" },
      { href: "/marketing", label: "Marketing", icon: "marketing" },
    ] },
    { title: "Operations", items: [
      { href: "/logistics", label: "Logistics", icon: "logistics" },
      { href: "/finance", label: "Finance", icon: "finance" },
      { href: "/finance/wallets", label: "Seller wallets", icon: "payments", badge: badge(counts.walletTopUps) },
      { href: "/finance/invoices", label: "Invoices", icon: "finance" },
      { href: "/finance/tax", label: "TCS & TDS", icon: "finance" },
      { href: "/security", label: "Security & audit", icon: "security" },
    ] },
    { title: "Support", items: supportItems },
    { title: "Team", items: [{ href: "/team", label: "Team & roles", icon: "customers" }, ...(permissions?.includes("payroll") ? [{ href: PAYROLL_URL, label: "Payroll ↗", icon: "finance" as const }] : [])] },
  ];
  const sections = all.map((section) => ({ ...section, items: section.items.filter((item) => allowed(item.href)) })).filter((section) => section.items.length);

  async function signOut() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); }
  }

  return (
    <PortalShell product={STAFF_PERMISSION_KEYS.every((k) => CONFIDENTIAL_PERMISSIONS.includes(k) || counts.permissions.includes(k)) ? "Admin console" : `Admin · ${counts.roleName}`} sections={sections} pathname={pathname} Link={Link} onSignOut={() => void signOut()}>
      {children}
      {permissions?.includes("support") ? <CallAlert /> : null}
      {permissions?.includes("livechat") ? <LiveChatHeartbeat onConsole={pathname === "/live-chat"} /> : null}
    </PortalShell>
  );
}
