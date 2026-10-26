"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Block (with a reason) or unblock a shopper's account. */
export default function BlockCustomer({ customerId, blocked }: { customerId: string; blocked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(block: boolean) {
    setBusy(true); setError("");
    const r = await fetch(`/api/v1/customers/${customerId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked: block, reason }) });
    const b = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { setError(b?.error?.message ?? "Couldn't save"); return; }
    setOpen(false); setReason(""); router.refresh();
  }
  if (blocked) return <button type="button" disabled={busy} onClick={() => void save(false)} className="rounded-full bg-chrome px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Unblock account</button>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:border-red-700">Block account</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. fake COD orders)" aria-label="Reason for blocking" className="w-64 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-900" />
      <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void save(true)} className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Block</button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-slate-500">Cancel</button>
      {error ? <span className="w-full text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
