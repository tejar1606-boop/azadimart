"use client";

import { PortalPageHeader, StatCard } from "@azadimart/ui";
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_KEYS, SUPPORT_PRIORITIES, SUPPORT_STATUS_STAFF_LABELS, supportCategoryLabel, type SupportStatus } from "@azadimart/shared";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Ticket = {
  id: string; number: number; requesterType: "CUSTOMER" | "SELLER"; category: string; priority: string; status: SupportStatus; subject: string; body: string;
  channel: string; assignedToUserId: string | null; lastMessageAt: string; lastReplyBy: string; staffUnread: boolean; createdAt: string; rating: number | null;
  requesterName: string; email: string | null; overdue: boolean;
};
type Stats = {
  open: number; openCustomers: number; openSellers: number; unassigned: number; overdue: number; mine: number; waiting: number; resolvedToday: number;
  firstReplyHours: number | null; rating: number | null; ratingCount: number; botChats7d: number; botEscalated7d: number;
};
type Member = { userId: string; name: string };

const VIEWS: Array<[string, string]> = [["open", "Needs reply"], ["mine", "Assigned to me"], ["unassigned", "Unassigned"], ["overdue", "Overdue"], ["waiting", "Waiting on requester"], ["resolved", "Resolved"], ["all", "All"]];
const PRIORITY_TONE: Record<string, string> = { URGENT: "bg-red-600 text-white", HIGH: "bg-red-50 text-red-700", NORMAL: "bg-slate-100 text-slate-600", LOW: "bg-slate-50 text-slate-500" };
const STATUS_TONE: Record<string, string> = { OPEN: "bg-sky-50 text-sky-700", IN_PROGRESS: "bg-brand-50 text-brand-700", WAITING: "bg-amber-50 text-amber-800", RESOLVED: "bg-india-light text-india-dark", CLOSED: "bg-slate-100 text-slate-600" };

const ago = (d: string) => {
  const mins = (Date.now() - new Date(d).getTime()) / 60000;
  if (mins < 60) return `${Math.max(1, Math.floor(mins))}m`;
  if (mins < 48 * 60) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

export default function SupportDesk() {
  const [view, setView] = useState("open");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ items: Ticket[]; stats: Stats; team: Member[]; me: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Remember the last view and filters for this browser.
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem("azm-support-desk") ?? "null"); if (saved) { setView(saved.view ?? "open"); setType(saved.type ?? ""); setCategory(saved.category ?? ""); setPriority(saved.priority ?? ""); } } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { try { localStorage.setItem("azm-support-desk", JSON.stringify({ view, type, category, priority })); } catch { /* storage blocked */ } }, [view, type, category, priority]);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const params = new URLSearchParams({ view });
      if (type) params.set("type", type);
      if (category) params.set("category", category);
      if (priority) params.set("priority", priority);
      if (query) params.set("q", query);
      fetch(`/api/v1/support/tickets?${params}`, { cache: "no-store" }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error?.message ?? "Couldn't load tickets");
        if (!cancelled) { setData(body); setError(""); }
      }).catch((e: Error) => !cancelled && setError(e.message)).finally(() => !cancelled && setLoading(false));
    };
    setLoading(true);
    load();
    const timer = setInterval(load, 30_000); // new tickets show up without a refresh
    return () => { cancelled = true; clearInterval(timer); };
  }, [view, type, category, priority, query]);

  const names = useMemo(() => new Map((data?.team ?? []).map((m) => [m.userId, m.name])), [data?.team]);
  const s = data?.stats;
  const deflection = s && s.botChats7d ? Math.round(((s.botChats7d - s.botEscalated7d) / s.botChats7d) * 100) : null;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Support" title="Support desk" description="Requests from customers and sellers. Reply, add internal notes, assign and resolve. The help assistant answers routine questions; only what needs a person lands here." />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Needs a reply" value={s ? String(s.open) : "–"} hint={s ? `${s.openCustomers} customer${s.openCustomers === 1 ? "" : "s"} · ${s.openSellers} seller${s.openSellers === 1 ? "" : "s"}` : undefined} icon="support" tone="brand" />
        <StatCard label="Overdue" value={s ? String(s.overdue) : "–"} hint={s ? `${s.unassigned} unassigned` : undefined} icon="bell" tone={s?.overdue ? "warn" : "default"} />
        <StatCard label="First reply (7 days)" value={s?.firstReplyHours != null ? (s.firstReplyHours < 1 ? "< 1 h" : `${s.firstReplyHours} h`) : "–"} hint={s ? `${s.resolvedToday} resolved in 24 h` : undefined} icon="dashboard" tone="good" />
        <StatCard label="Assistant solved (7 days)" value={deflection != null ? `${deflection}%` : "–"} hint={s ? `${s.botChats7d} chats · rating ${s.rating ?? "–"}${s.ratingCount ? ` (${s.ratingCount})` : ""}` : undefined} icon="sparkle" />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-3 [scrollbar-width:none]" role="tablist">
          {VIEWS.map(([key, label]) => {
            const count = key === "open" ? s?.open : key === "mine" ? s?.mine : key === "unassigned" ? s?.unassigned : key === "overdue" ? s?.overdue : key === "waiting" ? s?.waiting : undefined;
            return (
              <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
                className={"flex shrink-0 items-center gap-1.5 rounded-t-xl border-b-2 px-3.5 py-2.5 text-sm font-semibold " + (view === key ? "border-brand text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900")}>
                {label}{count ? <span className={"rounded-full px-1.5 py-0.5 text-[10px] " + (key === "overdue" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")}>{count}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_160px_200px_150px]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search #number, subject, name or email" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" aria-label="Search tickets" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="Requester">
            <option value="">Customers &amp; sellers</option><option value="CUSTOMER">Customers</option><option value="SELLER">Sellers</option>
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="Topic">
            <option value="">All topics</option>
            {SUPPORT_CATEGORY_KEYS.map((k) => <option key={k} value={k}>{SUPPORT_CATEGORIES[k].for === "SELLER" ? "Seller: " : ""}{SUPPORT_CATEGORIES[k].label}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="Priority">
            <option value="">Any priority</option>{SUPPORT_PRIORITIES.map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}
          </select>
        </div>

        {error ? <p className="m-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {loading && !data ? <p className="px-5 py-12 text-center text-sm text-slate-500">Loading…</p> : null}
        {data && !data.items.length ? (
          <div className="px-5 py-14 text-center">
            <p className="font-semibold">Nothing here</p>
            <p className="mt-1 text-sm text-slate-500">{view === "open" ? "Every request has a reply. Nice work." : "No tickets match these filters."}</p>
          </div>
        ) : null}

        {data?.items.length ? (
          <ul className="divide-y divide-slate-100">
            {data.items.map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className={"grid gap-x-4 gap-y-1 px-4 py-3.5 transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5 " + (t.staffUnread ? "bg-brand-50/40" : "")}>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {t.staffUnread ? <span className="h-2 w-2 rounded-full bg-brand" aria-label="New" /> : null}
                      <span className="text-xs font-semibold text-slate-400">#{t.number}</span>
                      <span className={"truncate " + (t.staffUnread ? "font-semibold" : "font-medium")}>{t.subject}</span>
                      {t.overdue ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">Overdue</span> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-slate-500">
                      <span className={"mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide " + (t.requesterType === "SELLER" ? "bg-navy/10 text-navy" : "bg-brand-50 text-brand-700")}>{t.requesterType === "SELLER" ? "Seller" : "Customer"}</span>
                      {t.requesterName} · {supportCategoryLabel(t.category)} · {t.body.slice(0, 90)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + PRIORITY_TONE[t.priority]}>{t.priority[0] + t.priority.slice(1).toLowerCase()}</span>
                    <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + STATUS_TONE[t.status]}>{SUPPORT_STATUS_STAFF_LABELS[t.status]}</span>
                    <span className="text-xs text-slate-500">{t.assignedToUserId ? names.get(t.assignedToUserId) ?? "Assigned" : "Unassigned"}</span>
                    <span className="w-9 text-right text-xs tabular-nums text-slate-500" title={new Date(t.lastMessageAt).toLocaleString("en-IN")}>{ago(t.lastMessageAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
