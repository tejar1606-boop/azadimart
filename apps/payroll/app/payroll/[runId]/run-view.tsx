"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import { monthLabel } from "../../components/payslip-document";
import { STATUS } from "../runs-view";

type Line = { code: string; label: string; amountPaise: number };
type Adj = { extraEarnings: Array<{ label: string; amountPaise: number }>; extraDeductions: Array<{ label: string; amountPaise: number }>; tdsOverridePaise: number | null; note: string | null };
type Slip = { id: string; code: string; name: string; designation: string; paidDays: string; lopDays: string; daysInMonth: number; grossPaise: number; totalDeductionsPaise: number; netPaise: number; earnings: Line[]; deductions: Line[]; employerContributions: Line[]; adjustments: Adj; bankLast4: string | null };
type Run = { id: string; month: string; status: "DRAFT" | "FINALISED" | "PAID"; finalisedAt: string | null; paidAt: string | null; paymentReference: string | null };
const rs = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const amt = (lines: Line[], code: string) => lines.find((l) => l.code === code)?.amountPaise ?? 0;

/** One month: every payslip, adjust drafts, then finalise and mark paid. */
export default function RunView({ runId }: { runId: string }) {
  const router = useRouter();
  const [data, setData] = useState<{ run: Run; items: Slip[] } | null>(null);
  const [editing, setEditing] = useState<Slip | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => fetch(`/api/v1/runs/${runId}`, { cache: "no-store" }).then((r) => r.json()).then((b) => { if (b.run) setData(b); else setMsg({ ok: false, text: b?.error?.message ?? "Payroll not found" }); }), [runId]);
  useEffect(() => { void load(); }, [load]);

  async function act(action: "REFRESH" | "FINALISE" | "PAID" | "DELETE", confirmText?: string) {
    let paymentReference: string | undefined;
    if (action === "PAID") { const ref = window.prompt("Bank transfer reference (optional), e.g. the bulk-transfer UTR:") ; if (ref === null) return; paymentReference = ref; }
    else if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action); setMsg(null);
    try {
      const r = await fetch(`/api/v1/runs/${runId}`, action === "DELETE" ? { method: "DELETE" } : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, paymentReference }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.message ?? "Action failed");
      if (action === "DELETE") { router.replace("/payroll"); return; }
      await load();
      setMsg({ ok: true, text: action === "FINALISE" ? "Payslips issued: employees can now see them. Download the bank sheet to pay salaries." : action === "PAID" ? "Marked as paid." : "Recalculated from the latest employee details." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Action failed" }); } finally { setBusy(""); }
  }

  if (!data) return <main className="p-10 text-sm text-slate-500">{msg?.text ?? "Loading…"}</main>;
  const { run, items } = data;
  const sum = (f: (s: Slip) => number) => items.reduce((n, s) => n + f(s), 0);
  const draft = run.status === "DRAFT";
  const missingBank = items.filter((s) => !s.bankLast4);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link href="/payroll" className="text-sm font-semibold text-slate-500 hover:text-slate-900">← Monthly payroll</Link>
      <PortalPageHeader eyebrow="Payroll" title={monthLabel(run.month)} description={draft ? "Draft: only HR can see it. Add leave or bonuses, then finalise to issue payslips." : run.status === "FINALISED" ? "Payslips are issued and locked. Pay salaries, then mark the month paid." : `Paid${run.paymentReference ? ` · ref ${run.paymentReference}` : ""}.`} />
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {([["Employees", String(items.length)], ["Gross pay", rs(sum((s) => s.grossPaise))], ["Deductions", rs(sum((s) => s.totalDeductionsPaise))], ["Net pay (to bank)", rs(sum((s) => s.netPaise))]] as const).map(([l, v]) => (
          <div key={l} className="border border-slate-200 bg-white p-4 shadow-card"><p className="text-xs text-slate-500">{l}</p><p className="mt-1 text-xl font-bold">{v}</p></div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={"rounded-full px-3 py-1 text-xs font-bold " + STATUS[run.status][1]}>{STATUS[run.status][0]}</span>
        {draft ? <>
          <button type="button" disabled={Boolean(busy)} onClick={() => void act("FINALISE", `Issue ${items.length} payslips for ${monthLabel(run.month)}? They will be locked and employees can see them.`)} className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy === "FINALISE" ? "Issuing…" : "Finalise & issue payslips"}</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void act("REFRESH")} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-40">Recalculate</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void act("DELETE", "Delete this draft payroll?")} className="ml-auto text-sm font-semibold text-red-600">Delete draft</button>
        </> : <>
          <a href={`/api/v1/runs/${runId}/bank-file`} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Download bank sheet (CSV)</a>
          {run.status === "FINALISED" ? <button type="button" disabled={Boolean(busy)} onClick={() => void act("PAID")} className="rounded-full bg-green-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">Mark salaries paid</button> : null}
        </>}
      </div>
      {missingBank.length ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">No bank account for: {missingBank.map((s) => s.name).join(", ")}. Add it on their employee page before paying.</p> : null}
      {msg ? <p className={"mt-3 rounded-lg px-3 py-2 text-sm " + (msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{msg.text}</p> : null}

      <section className="mt-4 border border-slate-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2.5">Employee</th><th className="px-3 text-right">Paid days</th><th className="px-3 text-right">Gross</th><th className="px-3 text-right">PF</th><th className="px-3 text-right">ESI</th><th className="px-3 text-right">PT</th><th className="px-3 text-right">TDS</th><th className="px-3 text-right">Other</th><th className="px-3 text-right">Net pay</th><th className="px-5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((s) => {
                const other = s.totalDeductionsPaise - amt(s.deductions, "PF") - amt(s.deductions, "ESI") - amt(s.deductions, "PT") - amt(s.deductions, "TDS");
                return (
                  <tr key={s.id}>
                    <td className="px-5 py-3"><span className="font-semibold">{s.name}</span><span className="block text-xs text-slate-500">{s.code} · {s.designation}</span>{s.adjustments.extraEarnings.length ? <span className="block text-xs text-green-700">+ {s.adjustments.extraEarnings.map((e) => e.label).join(", ")}</span> : null}</td>
                    <td className="px-3 text-right">{Number(s.paidDays)}/{s.daysInMonth}{Number(s.lopDays) ? <span className="block text-xs text-red-700">LOP {Number(s.lopDays)}</span> : null}</td>
                    <td className="px-3 text-right">{rs(s.grossPaise)}</td>
                    <td className="px-3 text-right text-slate-600">{rs(amt(s.deductions, "PF"))}</td>
                    <td className="px-3 text-right text-slate-600">{rs(amt(s.deductions, "ESI"))}</td>
                    <td className="px-3 text-right text-slate-600">{rs(amt(s.deductions, "PT"))}</td>
                    <td className="px-3 text-right text-slate-600">{rs(amt(s.deductions, "TDS"))}{s.adjustments.tdsOverridePaise != null ? <span className="block text-[10px] text-slate-400">set by HR</span> : null}</td>
                    <td className="px-3 text-right text-slate-600">{rs(other)}</td>
                    <td className="px-3 text-right font-bold">{rs(s.netPaise)}</td>
                    <td className="px-5 text-right"><span className="flex justify-end gap-2">{draft ? <button type="button" onClick={() => setEditing(s)} className="rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Adjust</button> : null}<Link href={`/payslips/${s.id}`} className="rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Payslip</Link></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {editing ? <AdjustDialog slip={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /> : null}
    </main>
  );
}

/** Draft payslip adjustments: leave without pay, one-off earnings, other deductions, TDS. */
function AdjustDialog({ slip, onClose, onSaved }: { slip: Slip; onClose: () => void; onSaved: () => void }) {
  const toRows = (l: Array<{ label: string; amountPaise: number }>) => l.map((x) => ({ label: x.label, amount: String(x.amountPaise / 100) }));
  const [lop, setLop] = useState(String(Number(slip.lopDays)));
  const [earn, setEarn] = useState(toRows(slip.adjustments.extraEarnings));
  const [ded, setDed] = useState(toRows(slip.adjustments.extraDeductions));
  const [tds, setTds] = useState(slip.adjustments.tdsOverridePaise != null ? String(slip.adjustments.tdsOverridePaise / 100) : "");
  const [note, setNote] = useState(slip.adjustments.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paise = (v: string) => Math.round((Number(v) || 0) * 100);
  async function save() {
    setBusy(true); setError("");
    try {
      const body = { lopDays: Number(lop) || 0, extraEarnings: earn.filter((r) => r.label.trim() && paise(r.amount) > 0).map((r) => ({ label: r.label.trim(), amountPaise: paise(r.amount) })), extraDeductions: ded.filter((r) => r.label.trim() && paise(r.amount) > 0).map((r) => ({ label: r.label.trim(), amountPaise: paise(r.amount) })), tdsOverridePaise: tds.trim() === "" ? null : paise(tds), note };
      const r = await fetch(`/api/v1/payslips/${slip.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.details?.[0]?.message ?? b?.error?.message ?? "Couldn't save");
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save"); setBusy(false); }
  }
  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";
  const rowsEditor = (rows: Array<{ label: string; amount: string }>, set: (r: Array<{ label: string; amount: string }>) => void, placeholder: string) => (
    <div className="mt-1 space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input className={field} value={r.label} onChange={(e) => set(rows.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} placeholder={placeholder} />
          <input className={field + " w-32"} inputMode="decimal" value={r.amount} onChange={(e) => set(rows.map((x, k) => (k === i ? { ...x, amount: e.target.value.replace(/[^\d.]/g, "") } : x)))} placeholder="₹" />
          <button type="button" onClick={() => set(rows.filter((_, k) => k !== i))} className="px-2 text-sm text-red-600">✕</button>
        </div>
      ))}
      {rows.length < 8 ? <button type="button" onClick={() => set([...rows, { label: "", amount: "" }])} className="text-xs font-semibold text-slate-700 underline">+ Add line</button> : null}
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Adjust · {slip.name}</h2>
        <p className="text-xs text-slate-500">{slip.code} · {slip.daysInMonth} days this month</p>
        <label className="mt-4 block text-sm font-medium">Leave without pay (LOP days)<input className={field + " mt-1"} inputMode="decimal" value={lop} onChange={(e) => setLop(e.target.value.replace(/[^\d.]/g, ""))} /><span className="mt-1 block text-xs text-slate-500">Half days allowed (e.g. 1.5). Days before joining or after leaving are added automatically.</span></label>
        <p className="mt-4 text-sm font-medium">Extra earnings (bonus, arrears, reimbursement)</p>
        {rowsEditor(earn, setEarn, "e.g. Diwali bonus")}
        <p className="mt-4 text-sm font-medium">Other deductions (advance recovery …)</p>
        {rowsEditor(ded, setDed, "e.g. Salary advance recovery")}
        <label className="mt-4 block text-sm font-medium">Income tax (TDS) this month<input className={field + " mt-1"} inputMode="decimal" value={tds} onChange={(e) => setTds(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Automatic (new regime)" /><span className="mt-1 block text-xs text-slate-500">Leave blank to calculate automatically; type an amount after an investment declaration.</span></label>
        <label className="mt-4 block text-sm font-medium">Note for HR (not on the payslip)<input className={field + " mt-1"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
        {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : "Save & recalculate"}</button>
        </div>
      </div>
    </div>
  );
}
