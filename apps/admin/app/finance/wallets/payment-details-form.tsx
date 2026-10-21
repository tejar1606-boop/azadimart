"use client";

import { useEffect, useState } from "react";

type Details = { accountName: string; bankName: string; accountNumber: string; ifsc: string; upiId: string; note: string };
const EMPTY: Details = { accountName: "", bankName: "", accountNumber: "", ifsc: "", upiId: "", note: "" };

/** LOIMART's bank account / UPI ID that sellers pay wallet top-ups to. Shown on every seller's Wallet page. */
export default function PaymentDetailsForm() {
  const [form, setForm] = useState<Details>(EMPTY);
  const [saved, setSaved] = useState<Details | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/wallets/payment-details", { cache: "no-store" }).then((r) => r.json()).then((b) => {
      if (b?.details) { setForm({ ...EMPTY, ...b.details }); setSaved({ ...EMPTY, ...b.details }); } else setOpen(true);
    }).catch(() => undefined);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const r = await fetch("/api/v1/wallets/payment-details", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const b = await r.json().catch(() => null);
      if (!r.ok) {
        const detail = Array.isArray(b?.error?.details) && b.error.details[0] ? b.error.details[0].message : "";
        throw new Error(detail || b?.error?.message || "Couldn't save");
      }
      setSaved(b.details); setForm(b.details); setOpen(false);
      setMessage({ ok: true, text: "Saved. Sellers now see these details on their Wallet page." });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't save" }); }
    finally { setBusy(false); }
  }

  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900";
  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Bank details for top-ups</h2>
          <p className="mt-0.5 text-xs text-slate-500">Where sellers pay to add money to their courier wallet. Shown on every seller&apos;s Wallet page.</p>
        </div>
        {saved && !open ? <button type="button" onClick={() => setOpen(true)} className="rounded-full px-4 py-1.5 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Edit</button> : null}
      </div>
      {!saved && !open ? null : !open && saved ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {saved.accountNumber ? <><div><dt className="text-xs text-slate-500">Account name</dt><dd className="font-medium">{saved.accountName}</dd></div>
          <div><dt className="text-xs text-slate-500">Bank</dt><dd className="font-medium">{saved.bankName || "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Account number</dt><dd className="font-mono font-medium">{saved.accountNumber}</dd></div>
          <div><dt className="text-xs text-slate-500">IFSC</dt><dd className="font-mono font-medium">{saved.ifsc}</dd></div></> : null}
          {saved.upiId ? <div><dt className="text-xs text-slate-500">UPI ID</dt><dd className="font-mono font-medium">{saved.upiId}</dd></div> : null}
          {saved.note ? <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Note for sellers</dt><dd>{saved.note}</dd></div> : null}
        </dl>
      ) : (
        <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Account holder name<input className={field} value={form.accountName} onChange={set("accountName")} placeholder="e.g. LOIMART Private Limited" maxLength={100} /></label>
          <label className="text-sm font-medium">Bank name<input className={field} value={form.bankName} onChange={set("bankName")} placeholder="e.g. HDFC Bank" maxLength={80} /></label>
          <label className="text-sm font-medium">Account number<input className={field + " font-mono"} inputMode="numeric" value={form.accountNumber} onChange={set("accountNumber")} maxLength={20} /></label>
          <label className="text-sm font-medium">IFSC<input className={field + " font-mono uppercase"} value={form.ifsc} onChange={set("ifsc")} placeholder="e.g. HDFC0001234" maxLength={11} /></label>
          <label className="text-sm font-medium">UPI ID (optional)<input className={field + " font-mono"} value={form.upiId} onChange={set("upiId")} placeholder="e.g. loimart@hdfcbank" maxLength={80} /></label>
          <label className="text-sm font-medium">Note for sellers (optional)<input className={field} value={form.note} onChange={set("note")} placeholder="e.g. Use your store name as the payment remark" maxLength={300} /></label>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={busy} className="rounded-full bg-chrome px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save details"}</button>
            {saved ? <button type="button" onClick={() => { setForm(saved); setOpen(false); }} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button> : null}
          </div>
          <p className="text-[11px] text-slate-400 sm:col-span-2">Use LOIMART&apos;s current account. Every change is recorded in the audit log.</p>
        </form>
      )}
      {message ? <p className={"mt-3 rounded-lg px-3 py-2 text-sm " + (message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{message.text}</p> : null}
    </section>
  );
}
