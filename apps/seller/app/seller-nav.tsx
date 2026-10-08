"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PortalShell, type PortalNavSection } from "@azadimart/ui";

// Public pages render without the portal chrome.
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

export type SellerCounts = { toShip: number; needsWork: number } | null;

const badge = (n: number) => (n > 0 ? String(n > 99 ? "99+" : n) : undefined);

export default function SellerChrome({ counts, children }: { counts: SellerCounts; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  if (PUBLIC_PATHS.has(pathname)) return <>{children}</>;

  const sections: PortalNavSection[] = [
    { items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }] },
    { title: "Catalogue", items: [
      { href: "/products", label: "Products", icon: "products", badge: badge(counts?.needsWork ?? 0) },
      { href: "/inventory", label: "Inventory", icon: "inventory" },
    ] },
    { title: "Orders", items: [
      { href: "/orders", label: "Orders", icon: "orders", badge: badge(counts?.toShip ?? 0) },
      { href: "/shipping", label: "Shipping settings", icon: "shipping" },
    ] },
    { title: "Account", items: [
      { href: "/payouts", label: "Payouts", icon: "payouts" },
      { href: "/kyc", label: "KYC & business", icon: "kyc" },
    ] },
  ];

  async function signOut() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); }
  }

  return (
    <PortalShell product="Seller Centre" sections={sections} pathname={pathname} Link={Link} onSignOut={() => void signOut()}>
      {children}
    </PortalShell>
  );
}
