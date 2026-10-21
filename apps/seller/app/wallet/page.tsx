"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Txn = { id: string; type: "TOP_UP" | "COURIER_CHARGE" | "COURIER_REFUND" | "ADJUSTMENT"; amountPaise: number; balanceAfterPaise: number; note: string | null; createdAt: string; orderNumber: string | null };
type TopUp = { id: string; amountPaise: number; reference: string; status: "PENDING" | "APPROVED" | "REJECTED"; adminNote: string | null; createdAt: string };
type PaymentDetails = { accountName: string; bankName: string; accountNumber: string; ifsc: string; upiId: string; note: string };
type Wallet = { balancePaise: number; maxPaise: number; pendingPaise: number; roomPaise: number; spentLast30DaysPaise: number; history: Txn[]; topUps: TopUp[]; paymentDetails: PaymentDetails | null };

/** A detail with a Copy button. */
function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0"><p className="text-[11px] text-slate-500">{label}</p><p className={"truncate text-sm font-semibold " + (mono ? "font-mono" : "")}>{value}</p></div>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); }} className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900">{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

const rupees = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const LABEL: Record<Txn["type"], string> = { TOP_UP: "Money added", COURIER_CHARGE: "Courier fee", COURIER_REFUND: "Courier fee returned", ADJUSTMENT: "Adjustment" };
const STATUS: Record<TopUp["status"], [string, string]> = { PENDING: ["Waiting for LOIMART to confirm", "bg-amber-50 text-amber-800"], APPROVED: ["Added to wallet", "bg-green-50 text-green-700"], REJECTED: ["Not added", "bg-red-50 text-red-700"] };

/** Courier wallet: prepaid balance (up to ₹500) that pays LOIMART courier fees automatically. */
export default function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/v1/wallet", { cache: "no-store" });
    if (r.ok) setWallet(await r.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function requestTopUp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const r = await fetch("/api/v1/wallet/top-ups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountPaise: Math.round(Number(amount) * 100), reference: reference.trim() }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) {
        const detail = Array.isArray(b?.error?.details) && b.error.details[0] ? b.error.details[0].message : "";
        throw new Error(detail || b?.error?.message || "Couldn't send the request");
      }
      setAmount(""); setReference("");
      setMessage({ ok: true, text: "Sent. We'll add it to your wallet once we see the payment in our account." });
      await load();
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't send the request" }); }
    finally { setBusy(false); }
  }

  const full = wallet ? Math.min(100, Math.round((wallet.balancePaise / wallet.maxPaise) * 100)) : 0;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Manage business" title="Courier wallet" description="When LOIMART ships your parcels, the courier fee is paid from this wallet automatically. If the wallet runs short, the rest comes off your next payout." />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Balance</p>
          <p className="mt-1 text-4xl font-semibold tracking-[-0.02em]">{wallet ? rupees(wallet.balancePaise) : "…"}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${full}%` }} /></div>
          <p className="mt-2 text-xs text-slate-500">The wallet holds up to {wallet ? rupees(wallet.maxPaise) : "₹500"}.{wallet?.pendingPaise ? ` ${rupees(wallet.pendingPaise)} waiting to be added.` : ""}</p>
          {wallet && wallet.balancePaise < 10000 ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Running low: courier fees not covered by the wallet come off your next payout.</p> : null}
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
            <div><dt className="text-xs text-slate-500">Spent on couriers (30 days)</dt><dd className="mt-0.5 font-semibold">{wallet ? rupees(wallet.spentLast30DaysPaise) : "…"}</dd></div>
            <div><dt className="text-xs text-slate-500">You can add now</dt><dd className="mt-0.5 font-semibold">{wallet ? rupees(wallet.roomPaise) : "…"}</dd></div>
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
          <h2 className="font-semibold">Add money</h2>
          {wallet?.paymentDetails ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
              <p className="pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pay LOIMART here</p>
              {wallet.paymentDetails.accountNumber ? <>
                <CopyRow label="Account name" value={wallet.paymentDetails.accountName} mono={false} />
                {wallet.paymentDetails.bankName ? <CopyRow label="Bank" value={wallet.paymentDetails.bankName} mono={false} /> : null}
                <CopyRow label="Account number" value={wallet.paymentDetails.accountNumber} />
                <CopyRow label="IFSC" value={wallet.paymentDetails.ifsc} />
              </> : null}
              {wallet.paymentDetails.upiId ? <CopyRow label="UPI ID" value={wallet.paymentDetails.upiId} /> : null}
              {wallet.paymentDetails.note ? <p className="pb-1.5 pt-1 text-xs text-slate-600">{wallet.paymentDetails.note}</p> : null}
              {wallet.paymentDetails.upiId ? (
                // Phones: opens GPay / PhonePe / Paytm with LOIMART's UPI ID (and the amount typed below).
                <a href={`upi://pay?pa=${encodeURIComponent(wallet.paymentDetails.upiId)}&pn=${encodeURIComponent(wallet.paymentDetails.accountName || "LOIMART")}&cu=INR&tn=${encodeURIComponent("Courier wallet top-up")}${Number(amount) > 0 ? `&am=${Number(amount).toFixed(2)}` : ""}`} className="mb-2 mt-1 inline-flex rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white sm:hidden">Pay with UPI app{Number(amount) > 0 ? ` · ₹${Number(amount)}` : ""}</a>
              ) : null}
            </div>
          ) : null}
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>{wallet?.paymentDetails ? "Pay LOIMART by bank transfer or UPI using the details above." : "Pay LOIMART by bank transfer or UPI, using the account details our team shared with you."}</li>
            <li>Enter the amount and the payment reference (UTR) below.</li>
            <li>We add it to your wallet once we see the payment.</li>
          </ol>
          <form onSubmit={requestTopUp} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Amount (₹)
              <input type="number" min={1} step="1" max={wallet ? wallet.roomPaise / 100 : 500} required value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900" placeholder={wallet ? `Up to ${Math.floor(wallet.roomPaise / 100)}` : ""} />
            </label>
            <label className="text-sm font-medium">Payment reference (UTR)
              <input required minLength={6} maxLength={40} value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm uppercase outline-none focus:border-slate-900" placeholder="e.g. 4321ABCD9876" />
            </label>
            <button disabled={busy || !wallet?.roomPaise} className="rounded-full bg-chrome px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2">{busy ? "Sending…" : wallet && !wallet.roomPaise ? "Wallet is full" : "Send top-up request"}</button>
          </form>
          {message ? <p className={"mt-3 rounded-lg px-3 py-2 text-sm " + (message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{message.text}</p> : null}
          <p className="mt-3 text-[11px] text-slate-400">Wallet money can only pay LOIMART courier fees. It can&apos;t be withdrawn or sent to anyone.</p>
        </section>
      </div>

      {wallet?.topUps.length ? (
        <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
          <h2 className="font-semibold">Top-up requests</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {wallet.topUps.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><b>{rupees(t.amountPaise)}</b> <span className="text-slate-500">· ref {t.reference} · {new Date(t.createdAt).toLocaleDateString("en-IN")}</span>{t.status === "REJECTED" && t.adminNote ? <span className="block text-xs text-red-700">{t.adminNote}</span> : null}</span>
                <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + STATUS[t.status][1]}>{STATUS[t.status][0]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
        <h2 className="font-semibold">Wallet history</h2>
        {!wallet ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : wallet.history.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nothing yet. Add money to start paying courier fees from your wallet.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-slate-500"><tr><th className="py-2 font-medium">Date</th><th className="py-2 font-medium">What</th><th className="py-2 text-right font-medium">Amount</th><th className="py-2 text-right font-medium">Balance</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {wallet.history.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 text-slate-500">{new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                    <td className="py-2.5">{LABEL[t.type]}{t.orderNumber ? <span className="text-slate-500"> · order {t.orderNumber}</span> : null}{t.note ? <span className="block text-xs text-slate-400">{t.note}</span> : null}</td>
                    <td className={"py-2.5 text-right font-semibold " + (t.amountPaise < 0 ? "text-slate-900" : "text-green-700")}>{t.amountPaise < 0 ? "−" : "+"}{rupees(Math.abs(t.amountPaise))}</td>
                    <td className="py-2.5 text-right text-slate-500">{rupees(t.balanceAfterPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
