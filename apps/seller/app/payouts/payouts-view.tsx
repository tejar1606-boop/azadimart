"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { StatCard } from "@azadimart/ui";
import { toCsv } from "@azadimart/shared";

type Bank = { accountHolderName: string; last4: string; ifsc: string; status: "PENDING" | "VERIFIED" | "REJECTED"; rejectionReason: string | null } | null;
type Breakdown = { grossPaise: number; sellerDiscountPaise?: number; shippingFeePaise?: number; cashbackPaise?: number; commissionRateBps: number; commissionPaise: number; gstOnCommissionPaise: number; tcsPaise: number; tdsPaise: number; netPaise: number };
type Upcoming = Breakdown & { orderNumber: string; title: string; quantity: number; deliveredAt: string; eligibleAt: string; openReturn: boolean };
type Payout = { id: string; status: string; amountPaise: number; grossPaise: number; deductionsPaise: number; itemCount: number; utr: string | null; mode: string; failureReason: string | null; paidAt: string | null; createdAt: string; periodStart: string | null; periodEnd: string | null; feeInvoiceId: string | null; feeInvoiceNumber: string | null };
type Item = Breakdown & { orderNumber: string; title: string; quantity: number };
type Data = {
  bankAccount: Bank; holdReason: string | null;
  commission: { freeUntil: string | null; isFreeNow: boolean; rateBps: number; holdDays: number };
  settlement: { cycle: "FORTNIGHTLY" | "DAILY"; nextAt: string };
  cashback?: { enabled: boolean; percentBps: number; maxPaise: number };
  summary: { paid30dPaise: number; waitingPaise: number; upcomingPaise: number; heldByReturnsPaise: number; nextPayoutAt: string | null };
  upcoming: Upcoming[]; payouts: Payout[];
  feeCreditNotes?: Array<{ id: string; number: string; issuedAt: string; totalPaise: number }>;
};

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const deductions = (b: Breakdown) => (b.sellerDiscountPaise ?? 0) + (b.shippingFeePaise ?? 0) + (b.cashbackPaise ?? 0) + b.commissionPaise + b.gstOnCommissionPaise + b.tcsPaise + b.tdsPaise;
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
      <p className="text-[11px] text-slate-500 sm:col-span-2">The name should match your business or the bank proof in your KYC. LOIMART verifies new accounts before sending money; your account number is stored encrypted.</p>
    </form>
  );
}

function BreakdownRows({ b }: { b: Breakdown }) {
  return (
    <span className="block text-[11px] leading-5 text-slate-500">
      {b.sellerDiscountPaise ? <span className="text-brand-700">LOIMART coupon (your share) {money(b.sellerDiscountPaise)} · </span> : null}
      {b.commissionRateBps ? `Commission ${b.commissionRateBps / 100}% ${money(b.commissionPaise)} + GST ${money(b.gstOnCommissionPaise)}` : "No commission"}
      {b.tcsPaise ? ` · TCS ${money(b.tcsPaise)}` : ""}{b.tdsPaise ? ` · TDS ${money(b.tdsPaise)}` : ""}
      {b.shippingFeePaise ? <span className="text-slate-700"> · LOIMART shipping {money(b.shippingFeePaise)}</span> : null}
      {b.cashbackPaise ? <span className="text-slate-700"> · Shopper cashback (your share) {money(b.cashbackPaise)}</span> : null}
    </span>
  );
}

export default function PayoutsView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [editingBank, setEditingBank] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [charges, setCharges] = useState<Record<string, Array<{ description: string; amountPaise: number }>>>({});

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
      setCharges((all) => ({ ...all, [id]: body?.charges ?? [] }));
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
            <p className="mt-0.5 text-sm text-green-800">Your first 3 months on LOIMART have no commission: you keep your sale price, minus the taxes the law requires (TCS and TDS){data.cashback?.enabled ? " and your share of the shopper's cashback" : ""}. After that, commission is {commission.rateBps / 100}% per order.</p></>
        ) : (
          <><p className="font-semibold">Commission: {commission.rateBps / 100}% per order</p>
            <p className="mt-0.5 text-sm text-slate-600">Plus 18% GST on the commission. Your free period ended{commission.freeUntil ? ` on ${date(commission.freeUntil)}` : ""}. Orders placed during it stay commission-free.</p></>
        )}
      </div>
      {data.holdReason ? <p role="status" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><b>Payments are on hold.</b> {data.holdReason} Contact LOIMART seller support.</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent to your bank (30 days)" value={money(summary.paid30dPaise)} icon="payouts" tone="good" />
        <StatCard label="Scheduled or on hold" value={money(summary.waitingPaise)} hint="Already calculated, waiting to be sent" icon="payments" />
        <StatCard label={`In the ${commission.holdDays}-day return window`} value={money(summary.upcomingPaise)} hint={data.settlement.cycle === "FORTNIGHTLY" ? `Next settlement ${date(data.settlement.nextAt)}` : summary.nextPayoutAt ? `Next payment from ${date(summary.nextPayoutAt)}` : "Delivered orders appear here"} icon="finance" tone="brand" />
        <StatCard label="Held by open returns" value={money(summary.heldByReturnsPaise)} hint="Paid once the return is closed" icon="returns" tone="warn" />
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Bank account for payments</h2>
          {bank && !editingBank ? <button type="button" onClick={() => setEditingBank(true)} className="text-xs font-semibold text-brand-600">Change account</button> : null}
        </div>
        {!bank || editingBank ? (
          <>{!bank ? <p className="mt-1 text-sm text-slate-600">Add the bank account where LOIMART should send your money.</p> : null}
            <BankForm onSaved={(b) => { setEditingBank(false); setData((d) => (d ? { ...d, bankAccount: b } : d)); void load(); }} onCancel={bank ? () => setEditingBank(false) : undefined} /></>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm">XXXX XXXX {bank.last4}</span>
            <span className="text-sm text-slate-600">{bank.accountHolderName} · {bank.ifsc}</span>
            <span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + BANK_STATUS[bank.status].tone}>{BANK_STATUS[bank.status].label}</span>
            {bank.status === "REJECTED" && bank.rejectionReason ? <p className="w-full text-sm text-red-700">{bank.rejectionReason}. Please add a correct account.</p> : null}
            {bank.status === "PENDING" ? <p className="w-full text-xs text-slate-500">LOIMART checks it against your bank proof, usually within 1 working day. Payments wait until then.</p> : null}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Upcoming payments</h2>
          <p className="text-xs text-slate-500">{data.settlement.cycle === "FORTNIGHTLY" ? <>Settled every 15 days, on the 1st and the 16th: orders whose {commission.holdDays}-day return window has closed are paid together, with a statement and LOIMART&apos;s fee invoice. Next settlement: <b>{date(data.settlement.nextAt)}</b>.</> : <>Delivered orders are paid {commission.holdDays} days after delivery (after the return window), straight to your bank.</>}</p>
        </div>
        {data.upcoming.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing waiting. Delivered orders will appear here.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.upcoming.map((u) => (
              <li key={u.orderNumber + u.title} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{u.title} × {u.quantity}</span>
                  <span className="block text-xs text-slate-500">{u.orderNumber} · delivered {date(u.deliveredAt)}</span><BreakdownRows b={u} /></span>
                <span className="text-left sm:text-right"><span className="block font-semibold">{money(u.netPaise)}</span>
                  <span className={"text-xs font-medium " + (u.openReturn ? "text-amber-700" : "text-slate-500")}>{u.openReturn ? "Return in progress" : data.settlement.cycle === "FORTNIGHTLY" ? `Return window closes ${date(u.eligibleAt)}` : new Date(u.eligibleAt) <= new Date() ? "In the next payment" : `Payable ${date(u.eligibleAt)}`}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Settlements</h2><p className="text-xs text-slate-500">Each settlement has a <b>statement</b> (every order and deduction) and, when LOIMART charged fees, a <b>tax invoice</b> for them. You can claim that GST as input tax credit.</p></div>
        {data.payouts.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">No payments yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-2.5 font-semibold">Date</th><th className="px-3 py-2.5 font-semibold">Orders</th><th className="px-3 py-2.5 text-right font-semibold">Sales</th><th className="px-3 py-2.5 text-right font-semibold">Deductions</th><th className="px-3 py-2.5 text-right font-semibold">You got</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-5 py-2.5 font-semibold">Documents</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.payouts.map((p) => (
                  <Fragment key={p.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => void toggle(p.id)}>
                      <td className="px-5 py-3">{date(p.paidAt ?? p.createdAt)}{p.periodStart && p.periodEnd ? <span className="block text-[11px] text-slate-500">For {date(p.periodStart)} – {date(new Date(new Date(p.periodEnd).getTime() - 60_000).toISOString())}</span> : null}</td>
                      <td className="px-3 py-3"><span className="font-semibold text-brand-600">{p.itemCount} item{p.itemCount === 1 ? "" : "s"} {open === p.id ? "▴" : "▾"}</span></td>
                      <td className="px-3 py-3 text-right">{money(p.grossPaise)}</td>
                      <td className="px-3 py-3 text-right text-slate-500">−{money(p.deductionsPaise)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{money(p.amountPaise)}</td>
                      <td className="px-5 py-3"><span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + (STATUS[p.status]?.tone ?? "")}>{STATUS[p.status]?.label ?? p.status}</span>
                        {p.utr ? <span className="mt-1 block font-mono text-[11px] text-slate-500">UTR {p.utr}{p.mode === "TEST" ? " · test" : ""}</span> : null}
                        {p.status !== "PAID" && p.failureReason ? <span className="mt-1 block max-w-[220px] text-[11px] text-slate-500">{p.failureReason}</span> : null}</td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}><span className="flex flex-col items-start gap-1.5">
                        <a href={`/payouts/${p.id}/statement`} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold hover:border-slate-900">Statement</a>
                        {p.feeInvoiceId ? <a href={`/payouts/fee-invoices/${p.feeInvoiceId}`} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold hover:border-slate-900" title={p.feeInvoiceNumber ?? ""}>Fee invoice</a> : null}
                      </span></td>
                    </tr>
                    {open === p.id ? (
                      <tr><td colSpan={7} className="bg-slate-50 px-5 py-3">
                        {!items[p.id] ? <p className="text-xs text-slate-500">Loading…</p> : (
                          <ul className="space-y-2">{items[p.id]!.map((it) => (
                            <li key={it.orderNumber + it.title} className="flex justify-between gap-3 text-xs"><span><b>{it.title} × {it.quantity}</b> · {it.orderNumber}<BreakdownRows b={it} /></span><span className="shrink-0 text-right">{money(it.grossPaise)} − {money(deductions(it))} = <b>{money(it.netPaise)}</b></span></li>
                          ))}
                          {(charges[p.id] ?? []).map((c) => <li key={c.description} className="flex justify-between gap-3 text-xs text-slate-600"><span>{c.description}</span><span className="shrink-0">−{money(c.amountPaise)}</span></li>)}</ul>
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

      {data.feeCreditNotes?.length ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h2 className="font-semibold">Fee credit notes</h2>
          <p className="text-xs text-slate-500">Commission (and its GST) LOIMART gave back on goods returned after you were paid. Reduce your input tax credit by this GST.</p>
          <ul className="mt-3 flex flex-wrap gap-2">{data.feeCreditNotes.map((n) => <li key={n.id}><a href={`/payouts/fee-invoices/${n.id}`} className="inline-block rounded-full border border-slate-300 px-3 py-1 text-xs font-bold hover:border-slate-900">{n.number} · {money(n.totalPaise)} · {date(n.issuedAt)}</a></li>)}</ul>
        </section>
      ) : null}

      <TaxDeducted />

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 text-sm shadow-card">
        <h2 className="font-semibold">How your payment is calculated</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
          <li><b>Sale price</b> of your items the customer kept (returned items are left out).</li>
          <li><b>Commission</b>: none in your first 3 months; then {commission.rateBps / 100}% of the sale price, plus 18% GST on the commission (you can claim this GST as input credit).</li>
          {data.cashback?.enabled ? <li><b>Shopper cashback</b>: shoppers get {data.cashback.percentBps / 100}% of what they pay as cashback in their LOIMART wallet{data.cashback.maxPaise ? ` (up to ${money(data.cashback.maxPaise)} per order)` : ""}, only when they keep the whole order past the return window. You pay the part for your items, from that order&apos;s payment. No cashback, nothing taken, if anything in the order is returned.</li> : null}
          <li><b>TCS</b> (0.5%, GST law, GST-registered sellers only) and <b>TDS</b> (0.1%, Income-tax law) are deducted and deposited with the government in your name; claim them in your returns.</li>
          <li>{data.settlement.cycle === "FORTNIGHTLY" ? `Settled on the 1st and 16th of every month for orders whose ${commission.holdDays}-day return window has closed.` : `Paid ${commission.holdDays} days after delivery, once the return window has closed.`} Cash on Delivery orders count from delivery too.</li>
        </ul>
      </section>
    </div>
  );
}

/** TCS and TDS deducted from the seller's payouts each month, to claim in their GST return and ITR. */
function TaxDeducted() {
  const [months, setMonths] = useState<Array<{ month: string; netSalesPaise: number; tcsPaise: number; tdsPaise: number }> | null>(null);
  useEffect(() => { void fetch("/api/v1/payouts/tax", { cache: "no-store" }).then((r) => r.json()).then((b) => setMonths(b.months ?? [])).catch(() => setMonths([])); }, []);
  if (!months?.length) return null;
  const label = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  function download() {
    const csv = toCsv([["Month", "Net sales settled (₹)", "TCS deducted (₹)", "TDS 194-O deducted (₹)"], ...months!.map((m) => [m.month, (m.netSalesPaise / 100).toFixed(2), (m.tcsPaise / 100).toFixed(2), (m.tdsPaise / 100).toFixed(2)])]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "loimart-tcs-tds.csv"; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div><h2 className="font-semibold">Tax deducted (TCS &amp; TDS)</h2><p className="text-xs text-slate-500">TCS shows in your GST portal (claim it in your GST return, GSTR-2X); TDS shows in your Form 26AS (claim it in your ITR; LOIMART issues Form 16A every quarter).</p></div>
        <button type="button" onClick={download} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold hover:border-slate-900">Download CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-2.5 font-semibold">Month</th><th className="px-3 py-2.5 text-right font-semibold">Net sales settled</th><th className="px-3 py-2.5 text-right font-semibold">TCS</th><th className="px-5 py-2.5 text-right font-semibold">TDS</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{months.map((m) => <tr key={m.month}><td className="px-5 py-2.5">{label(m.month)}</td><td className="px-3 py-2.5 text-right">{money(m.netSalesPaise)}</td><td className="px-3 py-2.5 text-right">{money(m.tcsPaise)}</td><td className="px-5 py-2.5 text-right">{money(m.tdsPaise)}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
