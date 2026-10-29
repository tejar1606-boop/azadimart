"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import { monthLabel } from "../components/payslip-document";

type Item = { id: string; month: string; grossPaise: number; totalDeductionsPaise: number; netPaise: number; paidDays: string; status: string };
const rs = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** The employee's own payslips: newest first, each opens as a printable payslip. */
export default function MyPayslips({ name }: { name: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => { void fetch("/api/v1/my/payslips", { cache: "no-store" }).then((r) => r.json()).then((b) => setItems(b.items ?? [])).catch(() => setItems([])); }, []);
  const latest = items?.[0];
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Payroll" title={`Hi ${name.split(" ")[0]}`} description="Your payslips, ready to view and download. Only you and HR can see them." />
      {latest ? (
        <Link href={`/payslips/${latest.id}`} className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-slate-200 bg-white p-6 shadow-card hover:border-slate-900">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Latest · {monthLabel(latest.month)}</p><p className="mt-1 text-3xl font-black">{rs(latest.netPaise)}</p><p className="text-sm text-slate-500">Net pay · gross {rs(latest.grossPaise)} · deductions {rs(latest.totalDeductionsPaise)}</p></div>
          <span className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">View payslip →</span>
        </Link>
      ) : null}
      <section className="mt-6 border border-slate-200 bg-white shadow-card">
        {!items ? <p className="p-6 text-sm text-slate-500">Loading…</p> : !items.length ? <p className="p-8 text-center text-sm text-slate-500">No payslips yet. They appear here once HR issues the month&apos;s payroll.</p> : (
          <ul className="divide-y divide-slate-100">
            {items.map((i) => (
              <li key={i.id}><Link href={`/payslips/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                <span><span className="block font-semibold">{monthLabel(i.month)}</span><span className="text-xs text-slate-500">{Number(i.paidDays)} paid days · {i.status === "PAID" ? "Paid" : "Issued"}</span></span>
                <span className="text-right"><span className="block font-bold">{rs(i.netPaise)}</span><span className="text-xs font-semibold text-slate-600">Download ↓</span></span>
              </Link></li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
