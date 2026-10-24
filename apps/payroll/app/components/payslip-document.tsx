"use client";

import { rupeesInWords } from "@azadimart/shared";
import { BrandWordmark } from "@azadimart/ui";

type Line = { code: string; label: string; amountPaise: number };
export type PayslipData = {
  month: string; daysInMonth: number; paidDays: string; lopDays: string;
  earnings: Line[]; deductions: Line[]; employerContributions: Line[];
  grossPaise: number; totalDeductionsPaise: number; netPaise: number; runStatus?: string;
  details: {
    employee: { code: string; name: string; designation: string; department: string | null; dateOfJoining: string; workState: string; panLast4: string | null; uan: string | null; esiNumber: string | null; bankLast4: string | null; ifsc: string | null };
    company: { legalName: string; address: string };
    monthlyCtcPaise: number;
  };
};

const rs = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const monthLabel = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const day = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const PRINT = `@media print { @page { size: A4; margin: 12mm; } body * { visibility: hidden !important; } .slip-doc, .slip-doc * { visibility: visible !important; } .slip-doc { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; } .slip-noprint { display: none !important; } }`;
const cell = "border border-slate-300 px-3 py-2";

/** A printable A4 payslip (Download PDF = the browser's Save as PDF). */
export default function PayslipDocument({ slip }: { slip: PayslipData }) {
  const e = slip.details.employee;
  const draft = slip.runStatus === "DRAFT";
  const rows = Math.max(slip.earnings.length, slip.deductions.length);
  return (
    <div>
      <style>{PRINT}</style>
      <div className="slip-noprint mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Payslip · {monthLabel(slip.month)}{draft ? " · DRAFT (not issued yet)" : ""}</p>
        <button type="button" onClick={() => window.print()} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Download PDF</button>
      </div>
      <article className="slip-doc relative mx-auto max-w-[210mm] overflow-hidden border border-slate-300 bg-white p-6 text-[12px] leading-snug text-slate-900 shadow-sm sm:p-8">
        {draft ? <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center"><span className="-rotate-[24deg] text-[84px] font-black tracking-widest text-amber-500/15">DRAFT</span></div> : null}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <div>
            <BrandWordmark className="text-3xl" />
            <p className="mt-1 font-semibold">{slip.details.company.legalName}</p>
            {slip.details.company.address ? <p className="max-w-sm text-slate-500">{slip.details.company.address}</p> : null}
          </div>
          <div className="text-right">
            <h1 className="text-lg font-black uppercase tracking-wide">Payslip</h1>
            <p className="font-semibold">{monthLabel(slip.month)}</p>
          </div>
        </header>

        <section className="grid gap-x-8 gap-y-1 border-b border-slate-200 py-4 sm:grid-cols-2">
          {([
            ["Employee", `${e.name} (${e.code})`], ["Designation", e.designation + (e.department ? ` · ${e.department}` : "")],
            ["Date of joining", day(e.dateOfJoining)], ["Work location", e.workState],
            ["PAN", e.panLast4 ? `XXXXXX${e.panLast4}` : "—"], ["UAN (PF)", e.uan ?? "—"],
            ...(e.esiNumber ? [["ESI number", e.esiNumber]] : []), ["Bank account", e.bankLast4 ? `XXXX ${e.bankLast4}${e.ifsc ? ` · ${e.ifsc}` : ""}` : "—"],
            ["Days in month", String(slip.daysInMonth)], ["Paid days", `${Number(slip.paidDays)}${Number(slip.lopDays) ? ` (LOP ${Number(slip.lopDays)})` : ""}`],
          ] as Array<[string, string]>).map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-0.5"><span className="text-slate-500">{k}</span><span className="text-right font-semibold">{v}</span></div>)}
        </section>

        <table className="mt-4 w-full border-collapse">
          <thead className="bg-slate-100 text-left"><tr><th className={cell}>Earnings</th><th className={cell + " text-right"}>Amount</th><th className={cell}>Deductions</th><th className={cell + " text-right"}>Amount</th></tr></thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => {
              const a = slip.earnings[i], d = slip.deductions[i];
              return <tr key={i}><td className={cell}>{a?.label ?? ""}</td><td className={cell + " text-right"}>{a ? rs(a.amountPaise) : ""}</td><td className={cell}>{d?.label ?? ""}</td><td className={cell + " text-right"}>{d ? rs(d.amountPaise) : ""}</td></tr>;
            })}
            <tr className="bg-slate-50 font-bold"><td className={cell}>Gross earnings</td><td className={cell + " text-right"}>{rs(slip.grossPaise)}</td><td className={cell}>Total deductions</td><td className={cell + " text-right"}>{rs(slip.totalDeductionsPaise)}</td></tr>
          </tbody>
        </table>

        <section className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-slate-900 px-4 py-3">
          <div><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Net pay</p><p className="text-[11px] text-slate-500">{rupeesInWords(slip.netPaise)}</p></div>
          <p className="text-2xl font-black">{rs(slip.netPaise)}</p>
        </section>

        {slip.employerContributions.length ? (
          <p className="mt-3 text-[11px] text-slate-500">Paid by LOIMART on top of your salary: {slip.employerContributions.map((c) => `${c.label} ${rs(c.amountPaise)}`).join(" · ")}. Monthly CTC {rs(slip.details.monthlyCtcPaise)}.</p>
        ) : null}
        <footer className="mt-6 border-t border-slate-200 pt-3 text-[10px] text-slate-500">This is a computer-generated payslip and needs no signature. Income tax is deducted under the new tax regime; declare investments to HR to adjust TDS. Confidential.</footer>
      </article>
    </div>
  );
}
