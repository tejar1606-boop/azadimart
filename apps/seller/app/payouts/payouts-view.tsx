"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { StatCard } from "@azadimart/ui";

type Bank = { accountHolderName: string; last4: string; ifsc: string; status: "PENDING" | "VERIFIED" | "REJECTED"; rejectionReason: string | null } | null;
type Breakdown = { grossPaise: number; commissionRateBps: number; commissionPaise: number; gstOnCommissionPaise: number; tcsPaise: number; tdsPaise: number; netPaise: number };
type Upcoming = Breakdown & { orderNumber: string; title: string; quantity: number; deliveredAt: string; eligibleAt: string; openReturn: boolean };
type Payout = { id: string; status: string; amountPaise: number; grossPaise: number; deductionsPaise: number; itemCount: number; utr: string | null; mode: string; failureReason: string | null; paidAt: string | null; createdAt: string };
type Item = Breakdown & { orderNumber: string; title: string; quantity: number };
type Data = {
  bankAccount: Bank; holdReason: string | null;
  commission: { freeUntil: string | null; isFreeNow: boolean; rateBps: number; holdDays: number };
  summary: { paid30dPaise: number; waitingPaise: number; upcomingPaise: number; heldByReturnsPaise: number; nextPayoutAt: string | null };
  upcoming: Upcoming[]; payouts: Payout[];
};

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const deductions = (b: Breakdown) => b.commissionPaise + b.gstOnCommissionPaise + b.tcsPaise + b.tdsPaise;
const STATUS: Record<string, { label: string; tone: string }> = {
  PAID: { label: "Sent", tone: "bg-green-50 text-green-700" },
  PROCESSING: { label: "On its way", tone: "bg-sky-50 text-sky-700" },
  PENDING: { label: "Scheduled", tone: "bg-slate-100 text-slate-700" },
  FAILED: { label: "Retrying", tone: "bg-amber-50 text-amber-800" },
  ON_HOLD: { label: "On hold", tone: "bg-red-50 text-red-700" },
};
const BANK_STATUS = { PENDING: { label: "Being verified", tone: "bg-amber-50 text-amber-800" }, VERIFIED: { label: "Verified", tone: "bg-green-50 text-green-700" }, REJECTED: { label: "Rejected", tone: "bg-red-50 text-red-700" } };

function BankForm({ onSaved, onCancel }: { onSaved: (bank: Bank) => void; onCancel?: () => void }) {
  const [form, setForm] = useState({ accountHolderName: "", accountNumber: "", confirmAccountNumber: "", ifsc: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const field = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm outline-none focus:border-slate-900";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: k === "ifsc" ? e.target.value.toUpperCase().slice(0, 11) : k.includes("ccount") && k !== "accountHolderName" ? e.target.value.replace(/\D/g, "").slice(0, 18) : e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/bank-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't save the bank account.");
      onSaved(body.bankAccount);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save the bank account."); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={(e) => void save(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Account holder name<input className={field + " mt-1"} value={form.accountHolderName} onChange={set("accountHolderName")} placeholder="As printed on your cheque or passbook" autoComplete="off" /></label>
      <label className="text-xs font-semibold text-slate-600">Account number<input className={field + " mt-1 font-mono"} value={form.accountNumber} onChange={set("accountNumber")} inputMode="numeric" autoComplete="off" /></label>
      <label className="text-xs font-semibold text-slate-600">Re-enter account number<input className={field + " mt-1 font-mono"} value={form.confirmAccountNumber} onChange={set("confirmAccountNumber")} inputMode="numeric" autoComplete="off" onPaste={(e) => e.preventDefault()} /></label>
      <label className="text-xs font-semibold text-slate-600">IFSC<input className={field + " mt-1 font-mono uppercase"} value={form.ifsc} onChange={set("ifsc")} placeholder="HDFC0001234" autoComplete="off" /></label>
      <div className="flex items-end gap-2">
        <button disabled={busy} className="h-11 rounded-full bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">{busy ? "Saving…" : "Save bank account"}</button>
        {onCancel ? <button type="button" onClick={onCancel} className="h-11 rounded-full px-4 text-sm font-semibold ring-1 ring-slate-300">Cancel</button> : null}
      </div>
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p> : null}
      <p className="text-[11px] text-slate-500 sm:col-span-2">The name should match your business or the bank proof in your KYC. AzadiMart verifies new accounts before sending money; your account number is stored encrypted.</p>
    </form>
  );
}

function BreakdownRows({ b }: { b: Breakdown }) {
  return (
    <span className="block text-[11px] leading-5 text-slate-500">
      {b.commissionRateBps ? `Commission ${b.commissionRateBps / 100}% ${money(b.commissionPaise)} + GST ${money(b.gstOnCommissionPaise)}` : "No commission"}
      {b.tcsPaise ? ` · TCS ${money(b.tcsPaise)}` : ""}{b.tdsPaise ? ` · TDS ${money(b.tdsPaise)}` : ""}
    </span>
  );
}

export default function PayoutsView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [editingBank, setEditingBank] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, Item[]>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/payouts", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't load payments.");
      setData(body); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't load payments."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(id: string) {
    setOpen((o) => (o === id ? null : id));
    if (!items[id]) {
      const body = await fetch(`/api/v1/payouts/${id}`).then((r) => r.json()).catch(() => null);
      setItems((all) => ({ ...all, [id]: body?.items ?? [] }));
    }
  }

  if (error) return <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!data) return <div className="mt-6 h-96 animate-pulse rounded-3xl bg-white" />;
  const { commission, summary, bankAccount: bank } = data;

  return (
    <div className="mt-6 space-y-5">
      <div className={"rounded-2xl border p-4 sm:p-5 " + (commission.isFreeNow ? "border-green-200 bg-gradient-to-r from-green-50 to-white" : "border-slate-200 bg-white")}>
        {commission.isFreeNow ? (
          <><p className="font-semibold text-green-900">No commission{commission.freeUntil ? ` until ${date(commission.freeUntil)}` : " during your first 3 months"}</p>
            <p className="mt-0.5 text-sm text-green-800">Your first 3 months on AzadiMart are free: you keep your full sale price, minus only the taxes the law requires (TCS and TDS). After that, commission is {commission.rateBps / 100}% per order.</p></>
        ) : (
          <><p className="font-semibold">Commission: {commission.rateBps / 100}% per order</p>
            <p className="mt-0.5 text-sm text-slate-600">Plus 18% GST on the commission. Your free period ended{commission.freeUntil ? ` on ${date(commission.freeUntil)}` : ""}. Orders placed during it stay commission-free.</p></>
        )}
      </div>
      {data.holdReason ? <p role="status" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><b>Payments are on hold.</b> {data.holdReason} Contact AzadiMart seller support.</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent to your bank (30 days)" value={money(summary.paid30dPaise)} icon="payouts" tone="good" />
        <StatCard label="Scheduled or on hold" value={money(summary.waitingPaise)} hint="Already calculated, waiting to be sent" icon="payments" />
        <StatCard label={`In the ${commission.holdDays}-day return window`} value={money(summary.upcomingPaise)} hint={summary.nextPayoutAt ? `Next payment from ${date(summary.nextPayoutAt)}` : "Delivered orders appear here"} icon="finance" tone="brand" />
        <StatCard label="Held by open returns" value={money(summary.heldByReturnsPaise)} hint="Paid once the return is closed" icon="returns" tone="warn" />
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Bank account for payments</h2>
          {bank && !editingBank ? <button type="button" onClick={() => setEditingBank(true)} className="text-xs font-semibold text-brand-600">Change account</button> : null}
        </div>
        {!bank || editingBank ? (
          <>{!bank ? <p className="mt-1 text-sm text-slate-600">Add the bank account where AzadiMart should send your money.</p> : null}
            <BankForm onSaved={(b) => { setEditingBank(false); setData((d) => (d ? { ...d, bankAccount: b } : d)); void load(); }} onCancel={bank ? () => setEditingBank(false) : undefined} /></>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm">XXXX XXXX {bank.last4}</span>
            <span className="text-sm text-slate-600">{bank.accountHolderName} · {bank.ifsc}</span>
            <span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + BANK_STATUS[bank.status].tone}>{BANK_STATUS[bank.status].label}</span>
            {bank.status === "REJECTED" && bank.rejectionReason ? <p className="w-full text-sm text-red-700">{bank.rejectionReason}. Please add a correct account.</p> : null}
            {bank.status === "PENDING" ? <p className="w-full text-xs text-slate-500">AzadiMart checks it against your bank proof, usually within 1 working day. Payments wait until then.</p> : null}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Upcoming payments</h2>
          <p className="text-xs text-slate-500">Delivered orders are paid {commission.holdDays} days after delivery (after the return window), straight to your bank.</p>
        </div>
        {data.upcoming.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing waiting. Delivered orders will appear here.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.upcoming.map((u) => (
              <li key={u.orderNumber + u.title} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{u.title} × {u.quantity}</span>
                  <span className="block text-xs text-slate-500">{u.orderNumber} · delivered {date(u.deliveredAt)}</span><BreakdownRows b={u} /></span>
                <span className="text-left sm:text-right"><span className="block font-semibold">{money(u.netPaise)}</span>
                  <span className={"text-xs font-medium " + (u.openReturn ? "text-amber-700" : "text-slate-500")}>{u.openReturn ? "Return in progress" : new Date(u.eligibleAt) <= new Date() ? "In the next payment" : `Payable ${date(u.eligibleAt)}`}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Payments sent</h2></div>
        {data.payouts.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">No payments yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-2.5 font-semibold">Date</th><th className="px-3 py-2.5 font-semibold">Orders</th><th className="px-3 py-2.5 text-right font-semibold">Sales</th><th className="px-3 py-2.5 text-right font-semibold">Deductions</th><th className="px-3 py-2.5 text-right font-semibold">You got</th><th className="px-5 py-2.5 font-semibold">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.payouts.map((p) => (
                  <Fragment key={p.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => void toggle(p.id)}>
                      <td className="px-5 py-3">{date(p.paidAt ?? p.createdAt)}</td>
                      <td className="px-3 py-3"><span className="font-semibold text-brand-600">{p.itemCount} item{p.itemCount === 1 ? "" : "s"} {open === p.id ? "▴" : "▾"}</span></td>
                      <td className="px-3 py-3 text-right">{money(p.grossPaise)}</td>
                      <td className="px-3 py-3 text-right text-slate-500">−{money(p.deductionsPaise)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{money(p.amountPaise)}</td>
                      <td className="px-5 py-3"><span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + (STATUS[p.status]?.tone ?? "")}>{STATUS[p.status]?.label ?? p.status}</span>
                        {p.utr ? <span className="mt-1 block font-mono text-[11px] text-slate-500">UTR {p.utr}{p.mode === "TEST" ? " · test" : ""}</span> : null}
                        {p.status !== "PAID" && p.failureReason ? <span className="mt-1 block max-w-[220px] text-[11px] text-slate-500">{p.failureReason}</span> : null}</td>
                    </tr>
                    {open === p.id ? (
                      <tr><td colSpan={6} className="bg-slate-50 px-5 py-3">
                        {!items[p.id] ? <p className="text-xs text-slate-500">Loading…</p> : (
                          <ul className="space-y-2">{items[p.id]!.map((it) => (
                            <li key={it.orderNumber + it.title} className="flex justify-between gap-3 text-xs"><span><b>{it.title} × {it.quantity}</b> · {it.orderNumber}<BreakdownRows b={it} /></span><span className="shrink-0 text-right">{money(it.grossPaise)} − {money(deductions(it))} = <b>{money(it.netPaise)}</b></span></li>
                          ))}</ul>
                        )}
                      </td></tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 text-sm shadow-card">
        <h2 className="font-semibold">How your payment is calculated</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
          <li><b>Sale price</b> of your items the customer kept (returned items are left out).</li>
          <li><b>Commission</b>: none in your first 3 months; then {commission.rateBps / 100}% of the sale price, plus 18% GST on the commission (you can claim this GST as input credit).</li>
          <li><b>TCS</b> (0.5%, GST law, GST-registered sellers only) and <b>TDS</b> (0.1%, Income-tax law) are deducted and deposited with the government in your name; claim them in your returns.</li>
          <li>Paid {commission.holdDays} days after delivery, once the return window has closed. Cash on Delivery orders count from delivery too.</li>
        </ul>
      </section>
    </div>
  );
}
