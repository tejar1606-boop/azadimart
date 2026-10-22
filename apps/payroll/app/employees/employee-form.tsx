"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import { PAYROLL_STATES, calculatePayslip } from "@azadimart/shared";

type Form = {
  fullName: string; email: string; phone: string; designation: string; department: string; dateOfJoining: string; dateOfExit: string;
  ctc: string; workState: string; metroCity: boolean; pfEnabled: boolean; esiEnabled: boolean;
  pan: string; uan: string; esiNumber: string; bankAccountNumber: string; ifsc: string;
};
const EMPTY: Form = { fullName: "", email: "", phone: "", designation: "", department: "", dateOfJoining: new Date().toISOString().slice(0, 10), dateOfExit: "", ctc: "", workState: "Andhra Pradesh", metroCity: false, pfEnabled: true, esiEnabled: true, pan: "", uan: "", esiNumber: "", bankAccountNumber: "", ifsc: "" };
const rs = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Add or edit an employee, with a live preview of their monthly payslip. */
export default function EmployeeForm({ employeeId }: { employeeId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<{ code: string; panLast4: string | null; bankLast4: string | null; hasLogin: boolean } | null>(null);
  const [loaded, setLoaded] = useState(!employeeId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!employeeId) return;
    void fetch(`/api/v1/employees/${employeeId}`, { cache: "no-store" }).then((r) => r.json()).then((b) => {
      const e = b.employee;
      if (!e) { setMsg({ ok: false, text: b?.error?.message ?? "Employee not found" }); return; }
      setForm({ ...EMPTY, fullName: e.fullName, email: e.email, phone: e.phone ?? "", designation: e.designation, department: e.department ?? "", dateOfJoining: e.dateOfJoining, dateOfExit: e.dateOfExit ?? "", ctc: String(e.monthlyCtcPaise / 100), workState: e.workState, metroCity: e.metroCity, pfEnabled: e.pfEnabled, esiEnabled: e.esiEnabled, uan: e.uan ?? "", esiNumber: e.esiNumber ?? "", ifsc: e.ifsc ?? "" });
      setSaved({ code: e.employeeCode, panLast4: e.panLast4, bankLast4: e.bankAccountLast4, hasLogin: e.hasLogin });
    }).finally(() => setLoaded(true));
  }, [employeeId]);

  const ctcPaise = Math.round((Number(form.ctc) || 0) * 100);
  const preview = useMemo(() => ctcPaise > 0 ? calculatePayslip({ monthlyCtcPaise: ctcPaise, workState: form.workState, metroCity: form.metroCity, pfEnabled: form.pfEnabled, esiEnabled: form.esiEnabled }, { year: 2026, month: 4, lopDays: 0 }) : null, [ctcPaise, form.workState, form.metroCity, form.pfEnabled, form.esiEnabled]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const body = {
        fullName: form.fullName, email: form.email, phone: form.phone, designation: form.designation, department: form.department, dateOfJoining: form.dateOfJoining,
        monthlyCtcPaise: ctcPaise, workState: form.workState, metroCity: form.metroCity, pfEnabled: form.pfEnabled, esiEnabled: form.esiEnabled,
        uan: form.uan, esiNumber: form.esiNumber, ifsc: form.ifsc, bankAccountNumber: form.bankAccountNumber,
        // PAN: only sent when typed (blank keeps the saved one on edit).
        ...(form.pan.trim() || !employeeId ? { pan: form.pan } : {}),
        ...(employeeId ? { dateOfExit: form.dateOfExit || null } : {}),
      };
      const r = await fetch(employeeId ? `/api/v1/employees/${employeeId}` : "/api/v1/employees", { method: employeeId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { const d = b?.error?.details?.[0]; throw new Error(d ? `${d.path?.[0] ?? ""}: ${d.message}` : b?.error?.message ?? "Couldn't save"); }
      if (!employeeId) { router.replace(`/employees/${b.employee.id}?added=1#login`); return; }
      setForm((f) => ({ ...f, pan: "", bankAccountNumber: "" }));
      setMsg({ ok: true, text: "Saved. Salary changes apply to draft and future months; issued payslips stay as they were." });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't save" }); } finally { setBusy(false); }
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900";
  const box = "border border-slate-200 bg-white p-5 shadow-card sm:p-6";
  if (!loaded) return <main className="p-10 text-sm text-slate-500">Loading…</main>;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link href="/employees" className="text-sm font-semibold text-slate-500 hover:text-slate-900">← Employees</Link>
      <PortalPageHeader eyebrow="Payroll" title={employeeId ? `${form.fullName || "Employee"}${saved ? ` · ${saved.code}` : ""}` : "Add employee"} description="Enter the monthly CTC once; Basic, HRA, allowances, PF, ESI, Professional Tax and TDS are worked out every month." />
      <form onSubmit={save} className="mt-6 grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-5">
          <section className={box}>
            <h2 className="font-semibold">Personal &amp; job</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Full name<input className={field} value={form.fullName} onChange={set("fullName")} required maxLength={120} /></label>
              <label className="text-sm font-medium">Work email<input type="email" className={field} value={form.email} onChange={set("email")} required /></label>
              <label className="text-sm font-medium">Mobile (optional)<input inputMode="numeric" className={field} value={form.phone} onChange={set("phone")} maxLength={10} /></label>
              <label className="text-sm font-medium">Designation<input className={field} value={form.designation} onChange={set("designation")} required placeholder="e.g. Customer support executive" /></label>
              <label className="text-sm font-medium">Department (optional)<input className={field} value={form.department} onChange={set("department")} placeholder="e.g. Operations" /></label>
              <label className="text-sm font-medium">Date of joining<input type="date" className={field} value={form.dateOfJoining} onChange={set("dateOfJoining")} required /></label>
              {employeeId ? <label className="text-sm font-medium">Last working day (if leaving)<input type="date" className={field} value={form.dateOfExit} onChange={set("dateOfExit")} /></label> : null}
            </div>
          </section>
          <section className={box}>
            <h2 className="font-semibold">Salary</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Monthly CTC (₹)<input inputMode="decimal" className={field} value={form.ctc} onChange={(e) => setForm({ ...form, ctc: e.target.value.replace(/[^\d.]/g, "") })} required placeholder="e.g. 30000" /><span className="mt-1 block text-xs text-slate-500">{ctcPaise ? `${rs(ctcPaise * 12)} a year` : "Cost to company per month, including employer PF/ESI"}</span></label>
              <label className="text-sm font-medium">Work state (for Professional Tax)<select className={field + " bg-white"} value={form.workState} onChange={set("workState")}>{PAYROLL_STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.metroCity} onChange={set("metroCity")} />Works in a metro city (HRA 50% of Basic)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pfEnabled} onChange={set("pfEnabled")} />Provident Fund (PF)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.esiEnabled} onChange={set("esiEnabled")} />ESI (applies only if gross ≤ ₹21,000)</label>
            </div>
          </section>
          <section className={box}>
            <h2 className="font-semibold">Statutory &amp; bank</h2>
            <p className="mt-0.5 text-xs text-slate-500">PAN and bank account are stored encrypted. {employeeId ? "Leave them blank to keep the saved ones." : ""}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">PAN{saved?.panLast4 ? <span className="font-normal text-slate-500"> (saved: XXXXXX{saved.panLast4})</span> : null}<input className={field + " font-mono uppercase"} value={form.pan} onChange={set("pan")} maxLength={10} placeholder={saved?.panLast4 ? "Type to replace" : "ABCDE1234F"} /></label>
              <label className="text-sm font-medium">UAN (PF number)<input inputMode="numeric" className={field + " font-mono"} value={form.uan} onChange={set("uan")} maxLength={12} /></label>
              <label className="text-sm font-medium">ESI number (optional)<input className={field + " font-mono"} value={form.esiNumber} onChange={set("esiNumber")} maxLength={20} /></label>
              <span />
              <label className="text-sm font-medium">Bank account number{saved?.bankLast4 ? <span className="font-normal text-slate-500"> (saved: XXXX {saved.bankLast4})</span> : null}<input inputMode="numeric" autoComplete="off" className={field + " font-mono"} value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value.replace(/\D/g, "") })} maxLength={18} placeholder={saved?.bankLast4 ? "Type to replace" : ""} /></label>
              <label className="text-sm font-medium">IFSC<input className={field + " font-mono uppercase"} value={form.ifsc} onChange={set("ifsc")} maxLength={11} placeholder="HDFC0001234" /></label>
            </div>
          </section>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={busy} className="rounded-full bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : employeeId ? "Save changes" : "Add employee"}</button>
            {msg ? <p className={"rounded-lg px-3 py-2 text-sm " + (msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{msg.text}</p> : null}
          </div>
          {employeeId && saved ? <LoginBox employeeId={employeeId} email={form.email} hasLogin={saved.hasLogin} onDone={() => setSaved({ ...saved, hasLogin: true })} /> : null}
        </div>

        <aside className={box + " h-fit xl:sticky xl:top-6"}>
          <h2 className="font-semibold">Monthly payslip preview</h2>
          <p className="text-xs text-slate-500">Full month, no leave. Final numbers come from each month&apos;s payroll.</p>
          {!preview ? <p className="mt-4 text-sm text-slate-500">Enter the monthly CTC to see the breakdown.</p> : (
            <div className="mt-4 space-y-3 text-sm">
              <div>{preview.earnings.map((l) => <p key={l.code} className="flex justify-between"><span className="text-slate-600">{l.label}</span><span>{rs(l.amountPaise)}</span></p>)}<p className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>Gross</span><span>{rs(preview.grossPaise)}</span></p></div>
              <div>{preview.deductions.map((l) => <p key={l.code} className="flex justify-between"><span className="text-slate-600">{l.label}</span><span>−{rs(l.amountPaise)}</span></p>)}</div>
              <p className="flex justify-between border-t-2 border-slate-900 pt-2 text-lg font-black"><span>Take-home</span><span>{rs(preview.netPaise)}</span></p>
              {preview.employerContributions.length ? <p className="text-xs text-slate-500">LOIMART also pays: {preview.employerContributions.map((c) => `${c.label} ${rs(c.amountPaise)}`).join(", ")}</p> : null}
            </div>
          )}
        </aside>
      </form>
    </main>
  );
}

/** Create or reset the employee's Payroll login (HR shares the password privately). */
function LoginBox({ employeeId, email, hasLogin, onDone }: { employeeId: string; email: string; hasLogin: boolean; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const suggest = () => setPassword("Loi-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"[b % 56]).join("") + "-" + (100 + (crypto.getRandomValues(new Uint8Array(1))[0]! % 900)));
  async function go() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/v1/employees/${employeeId}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.details?.[0]?.message ?? b?.error?.message ?? "Couldn't set up the login");
      onDone();
      setMsg({ ok: true, text: b.mode === "linked-team" ? `${email} already has a LOIMART team account: they sign in to Payroll with their team password.` : `Done. Share privately: sign in at this Payroll site with ${email} and the password above. They can change it under "Change password".` });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't set up the login" }); } finally { setBusy(false); }
  }
  return (
    <section id="login" className="scroll-mt-6 border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <h2 className="font-semibold">Payslip login {hasLogin ? <span className="ml-1 text-xs font-semibold text-green-700">✓ active</span> : null}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{hasLogin ? "Set a new password if they forgot theirs (they'll be signed out everywhere)." : "Lets the employee sign in here and download only their own payslips."}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium">{hasLogin ? "New password" : "Password"}<input className="mt-1 w-64 rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-slate-900" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} placeholder="At least 10 characters" /></label>
        <button type="button" onClick={suggest} className="rounded-full px-4 py-2.5 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Suggest one</button>
        <button type="button" disabled={busy || password.length < 10} onClick={() => void go()} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : hasLogin ? "Reset password" : "Create login"}</button>
      </div>
      {msg ? <p className={"mt-3 rounded-lg px-3 py-2 text-sm " + (msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{msg.text}</p> : null}
    </section>
  );
}
