"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { PortalPageHeader, StatCard } from "@azadimart/ui";

type Payout = { id: string; sellerId: string; storeName: string; status: string; amountPaise: number; grossPaise: number; deductionsPaise: number; itemCount: number; reference: string | null; mode: string; utr: string | null; attempts: number; failureReason: string | null; initiatedAt: string | null; paidAt: string | null; createdAt: string; accountLast4: string | null };
type Item = { orderNumber: string; title: string; quantity: number; grossPaise: number; commissionRateBps: number; commissionPaise: number; gstOnCommissionPaise: number; tcsPaise: number; tdsPaise: number; netPaise: number };
type Data = { mode: "TEST" | "LIVE" | "NOT_SET_UP"; dailyLimitPaise: number; summary: { paid30dPaise: number; commission30dPaise: number; tcs30dPaise: number; tds30dPaise: number; inReturnWindowPaise: number; inReturnWindowItems: number; heldByReturnsPaise: number; needsAttention: number }; items: Payout[] };

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const TONE: Record<string, string> = { PAID: "bg-green-50 text-green-700", PROCESSING: "bg-sky-50 text-sky-700", PENDING: "bg-slate-100 text-slate-700", FAILED: "bg-amber-50 text-amber-800", ON_HOLD: "bg-red-50 text-red-700" };
const FILTERS: Array<[string, string]> = [["ALL", "All"], ["ATTENTION", "Needs attention"], ["PAID", "Sent"], ["PENDING", "Scheduled"], ["ON_HOLD", "On hold"], ["FAILED", "Failed"]];
const needsAttention = (p: Payout) => p.status === "ON_HOLD" || p.status === "FAILED" || (p.status === "PENDING" && Boolean(p.failureReason));

export default function FinanceView() {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, Item[]>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/payouts", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't load finance data.");
      setData(body);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't load finance data."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (data?.items ?? []).filter((p) => filter === "ALL" || (filter === "ATTENTION" ? needsAttention(p) : p.status === filter)), [data, filter]);

  async function call(key: string, path: string, body: object | null, done: (json: Record<string, unknown>) => string) {
    setWorking(key); setError(""); setNotice("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error?.message ?? "Action failed.");
      setNotice(done(json)); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed."); } finally { setWorking(null); }
  }
  const runNow = () => call("run", "/api/cron/payouts", null, (r) => `Payout run done: ${r.created} new payout(s), ${r.PAID} sent, ${r.ON_HOLD} on hold, ${r.WAITING_APPROVAL} waiting for approval, ${r.FAILED} failed${r.NOT_SET_UP ? `, ${r.NOT_SET_UP} waiting for the bank connection` : ""}.`);
  const act = (p: Payout, action: "APPROVE" | "RETRY") => call(p.id, `/api/v1/payouts/${p.id}`, { action }, (r) => {
    const payout = r.payout as { status: string; failureReason: string | null } | undefined;
    return payout?.status === "PAID" ? `${money(p.amountPaise)} sent to ${p.storeName}.` : `${p.storeName}: ${payout?.failureReason ?? payout?.status ?? "updated"}`;
  });
  async function toggle(id: string) {
    setOpen((o) => (o === id ? null : id));
    if (!items[id]) {
      const body = await fetch(`/api/v1/payouts/${id}`).then((r) => r.json()).catch(() => null);
      setItems((all) => ({ ...all, [id]: body?.items ?? [] }));
    }
  }

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Finance" title="Seller payouts" description="Sellers are paid automatically from AzadiMart's current account 7 days after delivery. No commission in a seller's first 3 months, then 5% per order (+18% GST)." />
      {data?.mode === "TEST" ? <p className="mt-5 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900"><b>Test mode:</b> payouts are calculated and marked as sent, but no money leaves the bank. Connect your bank&apos;s payout API to go live.</p> : null}
      {data?.mode === "NOT_SET_UP" ? <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Bank connection not set up.</b> Payouts are calculated and wait here until AzadiMart&apos;s bank payout API is connected.</p> : null}

      {data ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Paid to sellers (30 days)" value={money(data.summary.paid30dPaise)} icon="payouts" tone="good" />
          <StatCard label="AzadiMart commission (30 days)" value={money(data.summary.commission30dPaise)} hint="Including 18% GST on commission" icon="finance" tone="brand" />
          <StatCard label="TCS + TDS to deposit (30 days)" value={money(data.summary.tcs30dPaise + data.summary.tds30dPaise)} hint={`TCS ${money(data.summary.tcs30dPaise)} (GSTR-8) · TDS ${money(data.summary.tds30dPaise)} (194-O)`} icon="security" />
          <StatCard label="In the 7-day return window" value={money(data.summary.inReturnWindowPaise)} hint={`${data.summary.inReturnWindowItems} item(s) · ${money(data.summary.heldByReturnsPaise)} held by open returns`} icon="returns" tone="warn" />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={"rounded-full px-3.5 py-1.5 text-xs font-semibold " + (filter === key ? "bg-chrome text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900")}>
            {label}{key === "ATTENTION" && data?.summary.needsAttention ? <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{data.summary.needsAttention}</span> : null}
          </button>
        ))}
        <button type="button" disabled={working === "run"} onClick={() => void runNow()} title="Also runs automatically every day at 10:00" className="ml-auto rounded-full bg-chrome px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{working === "run" ? "Running…" : "Run payouts now"}</button>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p> : null}

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        {!data ? <div className="h-64 animate-pulse" /> : shown.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No payouts here yet. Delivered orders become payouts 7 days after delivery.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-2.5 font-semibold">Seller</th><th className="px-3 py-2.5 font-semibold">Created</th><th className="px-3 py-2.5 text-right font-semibold">Sales</th><th className="px-3 py-2.5 text-right font-semibold">Deductions</th><th className="px-3 py-2.5 text-right font-semibold">Payout</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-5 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((p) => (
                  <Fragment key={p.id}>
                    <tr className="align-top">
                      <td className="px-5 py-3"><button type="button" onClick={() => void toggle(p.id)} className="text-left font-semibold hover:underline">{p.storeName}</button><span className="block text-xs text-slate-500">{p.itemCount} item{p.itemCount === 1 ? "" : "s"}{p.accountLast4 ? ` · a/c …${p.accountLast4}` : ""} · {p.reference}</span></td>
                      <td className="px-3 py-3 text-xs text-slate-600">{when(p.createdAt)}</td>
                      <td className="px-3 py-3 text-right">{money(p.grossPaise)}</td>
                      <td className="px-3 py-3 text-right text-slate-500">−{money(p.deductionsPaise)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{money(p.amountPaise)}</td>
                      <td className="px-3 py-3"><span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + (TONE[p.status] ?? "")}>{p.status.replace("_", " ")}</span>
                        {p.utr ? <span className="mt-1 block font-mono text-[11px] text-slate-500">UTR {p.utr}{p.mode === "TEST" ? " · test" : ""}</span> : null}
                        {p.status !== "PAID" && p.failureReason ? <span className="mt-1 block max-w-[240px] text-[11px] text-slate-600">{p.failureReason}</span> : null}
                        {p.attempts > 1 ? <span className="block text-[11px] text-slate-400">{p.attempts} attempts</span> : null}</td>
                      <td className="px-5 py-3 text-right">
                        {p.status === "PENDING" && p.failureReason?.includes("approval") ? <button type="button" disabled={working === p.id} onClick={() => void act(p, "APPROVE")} className="rounded-full bg-green-600 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-40">Approve &amp; send</button> : null}
                        {p.status === "FAILED" || p.status === "ON_HOLD" ? <button type="button" disabled={working === p.id} onClick={() => void act(p, p.status === "FAILED" && p.attempts >= 3 ? "APPROVE" : "RETRY")} className="rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-40">Retry now</button> : null}
                      </td>
                    </tr>
                    {open === p.id ? (
                      <tr><td colSpan={7} className="bg-slate-50 px-5 py-3">
                        {!items[p.id] ? <p className="text-xs text-slate-500">Loading…</p> : (
                          <table className="w-full text-xs"><thead className="text-left text-slate-500"><tr><th className="py-1 font-semibold">Order</th><th className="font-semibold">Item</th><th className="text-right font-semibold">Sale</th><th className="text-right font-semibold">Commission</th><th className="text-right font-semibold">GST</th><th className="text-right font-semibold">TCS</th><th className="text-right font-semibold">TDS</th><th className="text-right font-semibold">Net</th></tr></thead>
                            <tbody>{items[p.id]!.map((it) => (
                              <tr key={it.orderNumber + it.title} className="border-t border-slate-200"><td className="py-1.5 font-mono">{it.orderNumber}</td><td>{it.title} × {it.quantity}</td><td className="text-right">{money(it.grossPaise)}</td><td className="text-right">{it.commissionRateBps ? `${money(it.commissionPaise)} (${it.commissionRateBps / 100}%)` : "Free period"}</td><td className="text-right">{money(it.gstOnCommissionPaise)}</td><td className="text-right">{money(it.tcsPaise)}</td><td className="text-right">{money(it.tdsPaise)}</td><td className="text-right font-semibold">{money(it.netPaise)}</td></tr>
                            ))}</tbody></table>
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
      <p className="mt-3 text-xs text-slate-500">Safety: at most {data ? money(data.dailyLimitPaise) : "…"} is sent automatically per day; larger totals wait for approval here. Payouts go only to bank accounts you&apos;ve verified (Sellers &amp; KYC). Failed transfers retry daily up to 3 times with the same reference, so nobody is paid twice.</p>
    </main>
  );
}
