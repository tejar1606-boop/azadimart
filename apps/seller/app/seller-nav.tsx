"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/orders", label: "Orders" },
  { href: "/shipping", label: "Shipping" },
  { href: "/inventory", label: "Inventory" },
  { href: "/payouts", label: "Payouts" },
  { href: "/kyc", label: "KYC" },
];

// Public pages render without the portal navigation.
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

export default function SellerNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  if (PUBLIC_PATHS.has(pathname)) return null;

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="shrink-0 text-lg font-black tracking-[-0.04em]">
          Azadi<span className="text-amber-500">Mart</span>
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Seller</span>
        </Link>
        <nav aria-label="Seller portal" className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={"shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold " + (active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-950 disabled:opacity-50"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
