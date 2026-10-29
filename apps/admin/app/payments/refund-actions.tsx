"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Send a waiting refund through the payment gateway, or mark it paid by bank/UPI with the UTR. */
export default function RefundActions({ refundId, online }: { refundId: string; online: boolean }) {
  const router = useRouter();
  const [utr, setUtr] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(body: object) {
    setBusy(true); setError("");
    const r = await fetch(`/api/v1/payments/refunds/${refundId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { setError(b?.error?.message ?? "Couldn't update the refund"); return; }
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {online && !open ? <button type="button" disabled={busy} onClick={() => void act({ action: "SEND" })} className="rounded-full bg-chrome px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Send via gateway</button> : null}
      {open ? <>
        <input autoFocus value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="Bank/UPI reference (UTR)" aria-label="Bank or UPI reference" className="w-48 rounded-full border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-slate-900" />
        <button type="button" disabled={busy || utr.trim().length < 4} onClick={() => void act({ action: "PAID", reference: utr })} className="rounded-full bg-green-700 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Mark paid</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-slate-500">Cancel</button>
      </> : <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-slate-300 px-3.5 py-1.5 text-xs font-semibold hover:border-slate-900">Paid by bank/UPI</button>}
      {error ? <span className="w-full text-right text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
