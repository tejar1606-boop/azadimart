"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PortalShell, type PortalNavSection } from "@azadimart/ui";

export type AdminCounts = { sellers: number; qc: number; approvals: number; aplus: number };

const badge = (n: number) => (n > 0 ? String(n > 99 ? "99+" : n) : undefined);

export default function AdminChrome({ counts, children }: { counts: AdminCounts | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/login" || !counts) return <>{children}</>;

  const sections: PortalNavSection[] = [
    { items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }] },
    { title: "Sales", items: [
      { href: "/orders", label: "Orders", icon: "orders" },
      { href: "/payments", label: "Payments", icon: "payments" },
      { href: "/returns", label: "Returns", icon: "returns" },
      { href: "/customers", label: "Customers", icon: "customers" },
    ] },
    { title: "Catalogue", items: [
      { href: "/catalog", label: "All products", icon: "inventory" },
      { href: "/catalog/arrange", label: "Arrange products", icon: "arrange" },
      { href: "/catalog/categories", label: "Categories", icon: "categories" },
      { href: "/products", label: "Product approvals", icon: "products", badge: badge(counts.approvals) },
      { href: "/qc", label: "Quality control", icon: "qc", badge: badge(counts.qc) },
      { href: "/aplus", label: "A+ review", icon: "aplus", badge: badge(counts.aplus) },
      { href: "/reviews", label: "Customer reviews", icon: "star" },
      { href: "/sellers", label: "Sellers & KYC", icon: "sellers", badge: badge(counts.sellers) },
    ] },
    { title: "Storefront", items: [
      { href: "/online-store", label: "Online Store", icon: "store" },
      { href: "/marketing/coupons", label: "Coupons", icon: "coupons" },
      { href: "/marketing", label: "Marketing", icon: "marketing" },
    ] },
    { title: "Operations", items: [
      { href: "/logistics", label: "Logistics", icon: "logistics" },
      { href: "/finance", label: "Finance", icon: "finance" },
      { href: "/support", label: "Support", icon: "support" },
      { href: "/security", label: "Security & audit", icon: "security" },
    ] },
  ];

  async function signOut() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); }
  }

  return (
    <PortalShell product="Admin console" sections={sections} pathname={pathname} Link={Link} onSignOut={() => void signOut()}>
      {children}
    </PortalShell>
  );
}
