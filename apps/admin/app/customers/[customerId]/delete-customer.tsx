"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Delete a shopper's profile: type DELETE and give a reason. */
export default function DeleteCustomer({ customerId, hasOrders }: { customerId: string; hasOrders: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    const r = await fetch(`/api/v1/customers/${customerId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm, reason }) });
    const b = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) { setError(b?.error?.message ?? "Couldn't delete"); return; }
    if (b.mode === "DELETED") router.replace("/customers"); else { setOpen(false); router.refresh(); }
  }
  return (
    <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow-card">
      <h2 className="font-semibold text-red-800">Delete profile</h2>
      <p className="mt-1 text-sm text-slate-600">{hasOrders
        ? "This customer has orders, which the law says LOIMART must keep (GST invoices: 8 years). Deleting removes their name, email, mobile, password, saved addresses, wishlist, cart and unused wallet money, and they can never sign in to this account again. Their past orders stay, under “Deleted customer”."
        : "Removes this account and everything linked to it from the database for good. If they got the welcome bonus or contacted support, the account is anonymised instead so those records stay."} This can&apos;t be undone.</p>
      {!open ? <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:border-red-700">Delete profile…</button> : (
        <div className="mt-4 grid gap-3 sm:max-w-md">
          <label className="text-sm font-medium">Reason<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer asked to delete their account" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" /></label>
          <label className="text-sm font-medium">Type DELETE to confirm<input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-slate-900" /></label>
          <div className="flex items-center gap-3">
            <button type="button" disabled={busy || confirm !== "DELETE" || reason.trim().length < 3} onClick={() => void remove()} className="rounded-full bg-red-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Deleting…" : "Delete for good"}</button>
            <button type="button" onClick={() => { setOpen(false); setConfirm(""); setError(""); }} className="text-sm font-semibold text-slate-500">Cancel</button>
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
