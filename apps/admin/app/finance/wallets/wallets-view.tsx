"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import PaymentDetailsForm from "./payment-details-form";

type TopUp = { id: string; sellerId: string; storeName: string; balancePaise: number; amountPaise: number; reference: string; hasProof: boolean; status: "PENDING" | "APPROVED" | "REJECTED"; adminNote: string | null; createdAt: string; decidedAt: string | null };
type Balance = { sellerId: string; storeName: string; balancePaise: number; lastActivity: string | null };
type Data = { maxPaise: number; topUps: TopUp[]; balances: Balance[]; totalHeldPaise: number };

const rupees = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const REASONS = ["Payment not received in our account", "Amount doesn't match the payment", "Reference not found", "Screenshot doesn't show the payment", "Would exceed the ₹500 wallet limit"];

/** Seller courier wallets: check payments and credit top-ups; see what each seller holds. */
export default function WalletsView() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState<{ topUp: TopUp; reason: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/v1/wallets", { cache: "no-store" });
    const b = await r.json().catch(() => null);
    if (!r.ok) { setError(b?.error?.message ?? "Couldn't load wallets"); return; }
    setData(b);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(topUp: TopUp, decision: "APPROVE" | "REJECT", note?: string) {
    setBusy(topUp.id); setError("");
    try {
      const r = await fetch(`/api/v1/wallets/top-ups/${topUp.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.message ?? "Action failed");
      setRejecting(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(null); }
  }

  const pending = data?.topUps.filter((t) => t.status === "PENDING") ?? [];
  const decided = data?.topUps.filter((t) => t.status !== "PENDING").slice(0, 30) ?? [];

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Finance" title="Seller wallets" description={`Sellers prepay LOIMART courier fees (up to ${data ? rupees(data.maxPaise) : "₹500"} each). Check the money reached LOIMART's account, then approve the top-up. Courier fees are taken from the wallet automatically; any shortfall comes off the payout.`} />
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <PaymentDetailsForm />

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <h2 className="font-semibold">Waiting for you {pending.length ? <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{pending.length}</span> : null}</h2>
        {!data ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : pending.length === 0 ? <p className="mt-3 text-sm text-slate-500">No top-up requests waiting.</p> : (
          <ul className="mt-3 divide-y divide-slate-100">
            {pending.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p><b>{t.storeName}</b> wants to add <b>{rupees(t.amountPaise)}</b></p>
                  <p className="text-xs text-slate-500">Reference <span className="font-mono font-semibold text-slate-800">{t.reference}</span> · sent {new Date(t.createdAt).toLocaleString("en-IN")} · balance now {rupees(t.balancePaise)}</p>
                  {t.hasProof ? <a href={`/api/v1/wallets/top-ups/${t.id}/proof`} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-xs font-semibold text-slate-900 underline">View payment screenshot ↗</a> : <p className="mt-1 text-xs font-semibold text-amber-700">No payment screenshot (sent before screenshots were required)</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={busy === t.id} onClick={() => void decide(t, "APPROVE")} className="rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Money received · approve</button>
                  <button type="button" disabled={busy === t.id} onClick={() => setRejecting({ topUp: t, reason: REASONS[0]! })} className="rounded-full px-4 py-2 text-xs font-semibold text-red-600 ring-1 ring-red-200 disabled:opacity-50">Reject</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Balances</h2>{data ? <p className="text-xs text-slate-500">Total held: <b className="text-slate-900">{rupees(data.totalHeldPaise)}</b></p> : null}</div>
          {data && !data.balances.length ? <p className="mt-3 text-sm text-slate-500">No seller has used the wallet yet.</p> : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {data?.balances.map((b) => <li key={b.sellerId} className="flex justify-between py-2"><span>{b.storeName}</span><span className="font-semibold">{rupees(b.balancePaise)}</span></li>)}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h2 className="font-semibold">Recently decided</h2>
          {data && !decided.length ? <p className="mt-3 text-sm text-slate-500">Nothing yet.</p> : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {decided.map((t) => (
                <li key={t.id} className="py-2">
                  <p className="flex justify-between gap-2"><span>{t.storeName} · {rupees(t.amountPaise)} · <span className="font-mono text-xs">{t.reference}</span>{t.hasProof ? <> · <a href={`/api/v1/wallets/top-ups/${t.id}/proof`} target="_blank" rel="noreferrer" className="text-xs underline">screenshot</a></> : null}</span><span className={"text-xs font-semibold " + (t.status === "APPROVED" ? "text-green-700" : "text-red-600")}>{t.status === "APPROVED" ? "Added" : "Rejected"}</span></p>
                  {t.adminNote ? <p className="text-xs text-slate-500">{t.adminNote}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {rejecting ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reject-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lift">
            <h2 id="reject-title" className="text-lg font-semibold">Reject {rupees(rejecting.topUp.amountPaise)} from {rejecting.topUp.storeName}?</h2>
            <p className="mt-1 text-sm text-slate-500">Nothing is added to their wallet. The seller sees your reason and can send it again.</p>
            <div className="mt-4 space-y-2">{REASONS.map((reason) => <label key={reason} className="flex items-center gap-2 text-sm"><input type="radio" name="reason" checked={rejecting.reason === reason} onChange={() => setRejecting({ ...rejecting, reason })} />{reason}</label>)}</div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setRejecting(null)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
              <button type="button" disabled={busy === rejecting.topUp.id} onClick={() => void decide(rejecting.topUp, "REJECT", rejecting.reason)} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
