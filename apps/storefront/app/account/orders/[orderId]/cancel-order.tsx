"use client";

import { useEffect, useState } from "react";

const REASONS = [
  "Ordered by mistake",
  "Want to change size, colour or quantity",
  "Want to change the delivery address",
  "Found a better price elsewhere",
  "Delivery is taking too long",
  "No longer need it",
  "Other",
];

/**
 * "Cancel order" for the shopper while the order is still Confirmed (the
 * seller hasn't packed or shipped it). Asks for a reason, then cancels; the
 * server re-checks that it can still be cancelled and tells the seller.
 */
export default function CancelOrder({ orderId, cod, paidPaise = 0, onCancelled }: { orderId: string; cod: boolean; paidPaise?: number; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  // Paid online: refund to the LOIMART wallet (instant) or to the original payment method.
  const [refundTo, setRefundTo] = useState<"WALLET" | "SOURCE">("WALLET");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  async function cancel() {
    setBusy(true); setError("");
    try {
      const text = reason === "Other" ? note.trim() || "Other" : [reason, note.trim()].filter(Boolean).join(": ");
      const response = await fetch(`/api/v1/orders/${orderId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cod ? { reason: text } : { reason: text, refundTo }) });
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        // The seller shipped it meanwhile: explain, then show the order as it is now.
        setTimeout(onCancelled, 3500);
        throw new Error("The seller has already shipped this order, so it can't be cancelled now. You can refuse it at delivery or return it after it arrives.");
      }
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't cancel the order. Please try again.");
      setOpen(false);
      onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel the order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">Changed your mind? You can cancel until the seller packs your order.</p>
        <button type="button" onClick={() => { setOpen(true); setError(""); }} className="shrink-0 rounded-full border-2 border-red-200 px-5 py-2.5 text-sm font-bold text-red-700 transition hover:border-red-600 hover:bg-red-50">Cancel order</button>
      </div>

      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => { if (!busy) setOpen(false); }}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-white p-6 shadow-xl sm:rounded-[1.75rem]" onClick={(e) => e.stopPropagation()}>
            <h2 id="cancel-title" className="text-xl font-bold">Cancel this order?</h2>
            <p className="mt-1 text-sm text-slate-500">{cod ? "It's Cash on Delivery, so there's nothing to pay or refund." : "Choose where your refund goes."}</p>
            {cod ? null : (
              <fieldset className="mt-4">
                <legend className="text-sm font-semibold">Refund{paidPaise > 0 ? ` of ₹${(paidPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : ""} to</legend>
                <div className="mt-2 space-y-2">
                  {([["WALLET", "LOIMART wallet", "Instant. Use all of it on your next order; it never expires."], ["SOURCE", "Original payment method", "Back to your card, UPI or bank account in 5–7 working days."]] as const).map(([value, title, hint]) => (
                    <label key={value} className={"flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm transition " + (refundTo === value ? "border-slate-950 bg-slate-50" : "border-slate-200 hover:border-slate-400")}>
                      <input type="radio" name="refund-to" value={value} checked={refundTo === value} onChange={() => setRefundTo(value)} className="mt-0.5 accent-slate-950" />
                      <span><b>{title}</b>{value === "WALLET" ? <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">Instant</span> : null}<span className="block text-xs text-slate-500">{hint}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold">Why are you cancelling?</legend>
              <div className="mt-2 space-y-2">
                {REASONS.map((r) => (
                  <label key={r} className={"flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition " + (reason === r ? "border-slate-950 bg-slate-50 font-semibold" : "border-slate-200 hover:border-slate-400")}>
                    <input type="radio" name="cancel-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-slate-950" />{r}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-4 block text-sm font-semibold">{reason === "Other" ? "Tell us more" : "Anything else? (optional)"}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal" />
            </label>
            {reason.startsWith("Want to change") ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Tip: after cancelling, you can place a new order with the right {reason.includes("address") ? "address" : "size, colour or quantity"}.</p> : null}
            {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-full border border-slate-300 px-4 py-3 text-sm font-bold disabled:opacity-50">Keep order</button>
              <button type="button" disabled={busy || !reason || (reason === "Other" && !note.trim())} onClick={() => void cancel()} className="rounded-full bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">{busy ? "Cancelling…" : "Cancel order"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
