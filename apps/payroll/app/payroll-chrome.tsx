"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PortalShell, type PortalNavSection } from "@azadimart/ui";

export type PayrollMe = { name: string; isHr: boolean; isEmployee: boolean; adminUrl: string; canUseAdmin: boolean };

/** Payroll frame: HR screens for the payroll team, "My payslips" for employees. */
export default function PayrollChrome({ me, children }: { me: PayrollMe | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/login" || !me) return <>{children}</>;

  const sections: PortalNavSection[] = [
    ...(me.isHr ? [{ title: "Payroll", items: [
      { href: "/payroll", label: "Monthly payroll", icon: "payouts" as const },
      { href: "/employees", label: "Employees", icon: "customers" as const },
    ] }] : []),
    ...(me.isEmployee ? [{ title: "Me", items: [
      { href: "/my", label: "My payslips", icon: "finance" as const },
      { href: "/my/password", label: "Change password", icon: "security" as const },
    ] }] : []),
  ];

  async function signOut() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); }
  }
  const footer = (
    <div className="space-y-1 text-xs">
      {me.canUseAdmin ? <a href={me.adminUrl} className="block rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">Open Admin ↗</a> : null}
      <p className="px-3 pt-1 text-slate-400">{me.name}{me.isHr ? " · HR" : ""}</p>
    </div>
  );
  return (
    <PortalShell product="Payroll" sections={sections} pathname={pathname} Link={Link} onSignOut={() => void signOut()} footer={footer}>
      {children}
    </PortalShell>
  );
}
