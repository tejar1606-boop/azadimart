"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PortalShell, type PortalNavSection } from "@azadimart/ui";

export type StudioMe = { name: string; roleName: string; pendingAds: number; storefrontUrl: string; adminUrl: string; canUseAdmin: boolean };

/** Banner Studio frame: only banner screens, nothing else from Admin. */
export default function StudioChrome({ me, children }: { me: StudioMe | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/login" || !me) return <>{children}</>;

  const sections: PortalNavSection[] = [
    { title: "Banners", items: [
      { href: "/home-banners", label: "Home page banners", icon: "store" },
      { href: "/page-banners", label: "Page banners", icon: "categories" },
      { href: "/seller-ads", label: "Seller ad banners", icon: "marketing", badge: me.pendingAds ? String(me.pendingAds > 99 ? "99+" : me.pendingAds) : undefined },
    ] },
  ];

  async function signOut() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); }
  }

  const footer = (
    <div className="space-y-1 text-xs">
      <a href={me.storefrontUrl} target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">View the store ↗</a>
      {me.canUseAdmin ? <a href={me.adminUrl} className="block rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">Open Admin ↗</a> : null}
      <p className="px-3 pt-1 text-slate-400">{me.name} · {me.roleName}</p>
    </div>
  );

  return (
    <PortalShell product="Banner Studio" sections={sections} pathname={pathname} Link={Link} onSignOut={() => void signOut()} footer={footer}>
      {children}
    </PortalShell>
  );
}
