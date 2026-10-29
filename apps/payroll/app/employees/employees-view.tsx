"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Row = { id: string; employeeCode: string; fullName: string; email: string; designation: string; department: string | null; dateOfJoining: string; dateOfExit: string | null; isActive: boolean; monthlyCtcPaise: number; workState: string; hasLogin: boolean };
const rs = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Everyone on LOIMART's payroll. */
export default function EmployeesView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  useEffect(() => { void fetch("/api/v1/employees", { cache: "no-store" }).then((r) => r.json()).then((b) => setRows(b.items ?? [])).catch(() => setRows([])); }, []);
  const shown = (rows ?? []).filter((r) => showLeft || r.isActive);
  const active = (rows ?? []).filter((r) => r.isActive);
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Payroll" title="Employees" description="Salary details are confidential. PAN and bank account numbers are stored encrypted; only the last 4 digits are shown." />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href="/employees/new" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">+ Add employee</Link>
        <span className="text-sm text-slate-500">{active.length} active · monthly CTC {rs(active.reduce((n, r) => n + r.monthlyCtcPaise, 0))}</span>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} />Show people who left</label>
      </div>
      <section className="mt-4 border border-slate-200 bg-white shadow-card">
        {!rows ? <p className="p-6 text-sm text-slate-500">Loading…</p> : !shown.length ? <p className="p-10 text-center text-sm text-slate-500">No employees yet. Add your first employee to start payroll.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2.5">Employee</th><th className="px-3">Role</th><th className="px-3">Joined</th><th className="px-3">State</th><th className="px-3 text-right">Monthly CTC</th><th className="px-5">Payslip login</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id} className={r.isActive ? "" : "opacity-60"}>
                    <td className="px-5 py-3"><Link href={`/employees/${r.id}`} className="font-semibold hover:underline">{r.fullName}</Link><span className="block text-xs text-slate-500">{r.employeeCode} · {r.email}</span></td>
                    <td className="px-3">{r.designation}{r.department ? <span className="block text-xs text-slate-500">{r.department}</span> : null}</td>
                    <td className="px-3 text-xs">{r.dateOfJoining}{r.dateOfExit ? <span className="block text-red-700">Left {r.dateOfExit}</span> : null}</td>
                    <td className="px-3 text-xs">{r.workState}</td>
                    <td className="px-3 text-right font-semibold">{rs(r.monthlyCtcPaise)}</td>
                    <td className="px-5 text-xs">{r.hasLogin ? <span className="font-semibold text-green-700">✓ Has login</span> : <Link href={`/employees/${r.id}#login`} className="font-semibold text-amber-700 underline">Create login</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
