"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Add money to the shopper's wallet (goodwill, compensation). It can all be used on one order. */
export default function AddWalletMoney({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rupees, setRupees] = useState("");
  const [reason, setReason] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [expiryDays, setExpiryDays] = useState("0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const amountPaise = Math.round(Number(rupees) * 100);

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/v1/customers/${customerId}/wallet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountPaise, reason, orderNumber, expiryDays: Number(expiryDays) }) });
    const b = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: b?.error?.details?.[0]?.message ?? b?.error?.message ?? "Couldn't add the money" }); return; }
    setMsg({ ok: true, text: `₹${rupees} added to the wallet.` });
    setOpen(false); setRupees(""); setReason(""); setOrderNumber(""); setExpiryDays("0");
    router.refresh();
  }

  const field = "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-slate-900";
  if (!open) return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => { setOpen(true); setMsg(null); }} className="rounded-full bg-chrome px-4 py-2 text-sm font-semibold text-white">+ Add wallet money</button>
      {msg ? <span className={"text-sm " + (msg.ok ? "text-green-700" : "text-red-700")}>{msg.text}</span> : null}
    </div>
  );
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Amount (₹)
          <input autoFocus inputMode="decimal" value={rupees} onChange={(e) => setRupees(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 250" className={field} />
        </label>
        <label className="text-sm font-semibold">For order (optional)
          <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="AZM-…" className={field + " font-mono"} />
        </label>
        <label className="text-sm font-semibold sm:col-span-2">Reason (the customer sees this)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Sorry your order arrived late" className={field} />
        </label>
        <label className="text-sm font-semibold">Expires
          <select value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} className={field}>
            <option value="0">Never</option><option value="30">In 30 days</option><option value="90">In 90 days</option><option value="365">In 1 year</option>
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-500">The customer can use all of this money on a single order. The welcome bonus and referral money stay limited per order.</p>
      {msg && !msg.ok ? <p className="mt-2 text-sm text-red-700">{msg.text}</p> : null}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy || !(amountPaise >= 100) || reason.trim().length < 3} onClick={() => void save()} className="rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Adding…" : rupees ? `Add ₹${rupees}` : "Add"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
      </div>
    </div>
  );
}
