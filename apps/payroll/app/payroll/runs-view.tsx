"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import { monthLabel } from "../components/payslip-document";

type Run = { id: string; month: string; status: "DRAFT" | "FINALISED" | "PAID"; employees: number; grossPaise: number; netPaise: number; finalisedAt: string | null; paidAt: string | null };
const rs = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
export const STATUS = { DRAFT: ["Draft", "bg-amber-50 text-amber-800"], FINALISED: ["Payslips issued", "bg-sky-50 text-sky-800"], PAID: ["Paid", "bg-green-50 text-green-700"] } as const;

/** Every month's payroll, and starting a new month. */
export default function RunsView() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const months = useMemo(() => { const ist = new Date(Date.now() + 330 * 60_000); return Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - i, 1)).toISOString().slice(0, 7)); }, []);
  const [month, setMonth] = useState(months[0]!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/v1/runs", { cache: "no-store" }).then((r) => r.json()).then((b) => setRuns(b.items ?? [])).catch(() => setRuns([])); }, []);
  const taken = new Set((runs ?? []).map((r) => r.month));
  async function start() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/v1/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.message ?? "Couldn't start payroll");
      router.push(`/payroll/${b.run.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't start payroll"); setBusy(false); }
  }
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Payroll" title="Monthly payroll" description="1. Start the month: payslips are calculated for everyone employed. 2. Add leave (LOP), bonuses or other deductions. 3. Finalise: employees can see their payslips. 4. Pay salaries with the bank sheet and mark the month paid." />
      <div className="mt-5 flex flex-wrap items-center gap-2 border border-slate-200 bg-white p-4 shadow-card">
        <span className="text-sm font-semibold">Start payroll for</span>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm">{months.map((m) => <option key={m} value={m} disabled={taken.has(m)}>{monthLabel(m)}{taken.has(m) ? " (done)" : ""}</option>)}</select>
        <button type="button" disabled={busy || taken.has(month)} onClick={() => void start()} className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Calculating…" : "Start payroll"}</button>
        {error ? <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </div>
      <section className="mt-5 border border-slate-200 bg-white shadow-card">
        {!runs ? <p className="p-6 text-sm text-slate-500">Loading…</p> : !runs.length ? <p className="p-10 text-center text-sm text-slate-500">No payroll yet. Add employees, then start this month&apos;s payroll.</p> : (
          <ul className="divide-y divide-slate-100">
            {runs.map((r) => (
              <li key={r.id}><Link href={`/payroll/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                <span><span className="block font-semibold">{monthLabel(r.month)}</span><span className="text-xs text-slate-500">{r.employees} employee{r.employees === 1 ? "" : "s"} · gross {rs(r.grossPaise)}</span></span>
                <span className="flex items-center gap-4"><span className="text-right"><span className="block font-bold">{rs(r.netPaise)}</span><span className="text-xs text-slate-500">net pay</span></span><span className={"rounded-full px-3 py-1 text-xs font-bold " + STATUS[r.status][1]}>{STATUS[r.status][0]}</span></span>
              </Link></li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
