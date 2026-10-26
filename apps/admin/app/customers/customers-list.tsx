"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = { id: string; name: string; email: string; phone: string | null; phoneVerified: boolean; status: "ACTIVE" | "DISABLED" | "PENDING"; joinedAt: string; lastLoginAt: string | null; orders: number; spentPaise: number; lastOrderAt: string | null; walletPaise: number };
type Data = { items: Row[]; total: number; page: number; pages: number; stats: { all: number; today: number; verified: number; disabled: number; buyers: number } };
const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const FILTERS = [["ALL", "All"], ["BUYERS", "Have ordered"], ["ACTIVE", "Active"], ["DISABLED", "Blocked"]] as const;

/** Searchable list of shoppers with their order count, spend and wallet balance. */
export default function CustomersList() {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof FILTERS)[number][0]>("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => { setQ(query.trim()); setPage(1); }, 300); return () => window.clearTimeout(t); }, [query]);
  useEffect(() => {
    setError(false);
    const params = new URLSearchParams({ q, status, page: String(page) });
    void fetch(`/api/v1/customers?${params}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError(true));
  }, [q, status, page]);
  const s = data?.stats;

  return (
    <>
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {([["Customers", s?.all], ["Joined today", s?.today], ["Mobile verified", s?.verified], ["Have ordered", s?.buyers], ["Blocked", s?.disabled]] as const).map(([label, v]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{v == null ? "…" : v.toLocaleString("en-IN")}</p></div>
        ))}
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or mobile" aria-label="Search customers" className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-900 sm:max-w-sm" />
          <div className="flex flex-wrap gap-1.5">{FILTERS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => { setStatus(key); setPage(1); }} className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (status === key ? "bg-chrome text-white" : "ring-1 ring-slate-300 hover:ring-slate-900")}>{label}</button>
          ))}</div>
        </div>
        {error ? <p className="p-8 text-center text-sm text-red-700">Couldn&apos;t load customers. Try again.</p> : !data ? <p className="p-8 text-center text-sm text-slate-500">Loading…</p> : data.items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{q ? `No customer matches “${q}”.` : "No customers here yet."}</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2.5">Customer</th><th className="px-3">Mobile</th><th className="px-3">Joined</th><th className="px-3 text-right">Orders</th><th className="px-3 text-right">Spent</th><th className="px-3">Last order</th><th className="px-3 text-right">Wallet</th><th className="px-5">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{data.items.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-5 py-3"><Link href={`/customers/${c.id}`} className="font-semibold hover:underline">{c.name}</Link><p className="text-xs text-slate-500">{c.email}</p></td>
                <td className="px-3 font-mono text-xs">{c.phone ?? "—"}{c.phone ? <span className={"ml-1 font-sans " + (c.phoneVerified ? "text-green-700" : "text-slate-400")}>{c.phoneVerified ? "✓" : "(not verified)"}</span> : null}</td>
                <td className="px-3 text-xs text-slate-600">{date(c.joinedAt)}</td>
                <td className="px-3 text-right font-semibold">{c.orders}</td>
                <td className="px-3 text-right">{money(c.spentPaise)}</td>
                <td className="px-3 text-xs text-slate-600">{date(c.lastOrderAt)}</td>
                <td className="px-3 text-right">{c.walletPaise ? money(c.walletPaise) : "—"}</td>
                <td className="px-5">{c.email.endsWith("@deleted.invalid") ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Deleted</span> : c.status === "DISABLED" ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Blocked</span> : <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">Active</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {data && data.pages > 1 ? <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
          <span className="text-slate-500">{data.total.toLocaleString("en-IN")} customers · page {data.page} of {data.pages}</span>
          <span className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-full px-3 py-1.5 ring-1 ring-slate-300 disabled:opacity-40">Previous</button><button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded-full px-3 py-1.5 ring-1 ring-slate-300 disabled:opacity-40">Next</button></span>
        </div> : null}
      </section>
    </>
  );
}
