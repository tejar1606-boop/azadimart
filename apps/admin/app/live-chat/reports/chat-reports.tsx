"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Stars = Array<{ rating: number; count: number }>;
type Report = {
  filter: { from: string; to: string };
  summary: { total: number; answered: number; missed: number; tickets: number; open: number; answerRate: number | null; avgWaitSeconds: number | null; avgFirstReplySeconds: number | null; avgDurationSeconds: number | null; avgRating: number | null; rated: number; ratingRate: number | null; stars: Stars };
  agents: Array<{ id: string; name: string; chats: number; resolved: number; tickets: number; avgFirstReplySeconds: number | null; avgDurationSeconds: number | null; avgRating: number | null; rated: number; lowRatings: number }>;
  daily: Array<{ day: string; chats: number; missed: number; avgRating: number | null; rated: number }>;
  rows: Array<{ id: string; source: string; requesterType: string; name: string; contact: string | null; topic: string; agent: string | null; createdAt: string; waitSeconds: number | null; firstReplySeconds: number | null; durationSeconds: number | null; messages: number; files: number; status: string; endReason: string | null; acceptedAt: string | null; rating: number | null; ratingNote: string | null; ticketNumber: number | null }>;
};

const istDay = (offsetDays = 0) => new Date(Date.now() + 330 * 60_000 - offsetDays * 86_400_000).toISOString().slice(0, 10);
const RANGES: Array<[string, number]> = [["Today", 0], ["7 days", 6], ["30 days", 29], ["90 days", 89]];
const dur = (s: number | null) => (s === null ? "—" : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const outcome = (r: Report["rows"][number]) => r.status !== "ENDED" ? ["Open", "bg-sky-50 text-sky-700"] : !r.acceptedAt && r.endReason !== "TICKET" ? ["Missed", "bg-red-50 text-red-700"]
  : r.endReason === "TICKET" ? ["Support request", "bg-amber-50 text-amber-800"] : r.endReason === "IDLE" ? ["Timed out", "bg-slate-100 text-slate-600"] : ["Resolved", "bg-emerald-50 text-emerald-700"];
const starText = (n: number | null) => (n === null ? "—" : "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n)));

/**
 * Admin → Live chat → Reports: how many chats, how fast the team answered,
 * ratings (with the star split and feedback), each agent's numbers, a daily
 * trend, every chat in the range, and a CSV download of all of it.
 */
export default function ChatReports() {
  const [from, setFrom] = useState(istDay(29));
  const [to, setTo] = useState(istDay(0));
  const [agent, setAgent] = useState("");
  const [source, setSource] = useState("");
  const [rating, setRating] = useState("");
  const [result, setResult] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => new URLSearchParams(Object.entries({ from, to, agent, source, rating, outcome: result }).filter(([, v]) => v)).toString(), [from, to, agent, source, rating, result]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/v1/live-chat/report?${query}`, { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message ?? "Couldn't load the report");
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load the report"); } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { void load(); }, [load]);

  const s = data?.summary;
  const maxStars = Math.max(1, ...(s?.stars.map((x) => x.count) ?? [1]));
  const maxDay = Math.max(1, ...(data?.daily.map((d) => d.chats) ?? [1]));
  const input = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm";

  return (
    <main className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/live-chat" className="text-xs font-semibold text-slate-500 hover:text-slate-900">← Live chat</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Live chat reports</h1>
          <p className="text-sm text-slate-500">Chats, response times and ratings. Times are India time.</p>
        </div>
        <a href={`/api/v1/live-chat/report?${query}&format=csv`} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
          Download CSV
        </a>
      </div>

      {/* filters */}
      <section className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
        <div className="flex rounded-lg bg-slate-100 p-1">
          {RANGES.map(([label, days]) => {
            const active = from === istDay(days) && to === istDay(0);
            return <button key={label} type="button" onClick={() => { setFrom(istDay(days)); setTo(istDay(0)); }} className={"rounded-md px-2.5 py-1.5 text-xs font-semibold " + (active ? "bg-white shadow-sm" : "text-slate-500")}>{label}</button>;
          })}
        </div>
        <label className="text-xs font-medium text-slate-600">From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={input + " ml-1"} /></label>
        <label className="text-xs font-medium text-slate-600">To<input type="date" value={to} min={from} max={istDay(0)} onChange={(e) => setTo(e.target.value)} className={input + " ml-1"} /></label>
        <select aria-label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} className={input}>
          <option value="">All agents</option>
          {data?.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select aria-label="From" value={source} onChange={(e) => setSource(e.target.value)} className={input}>
          <option value="">Store + seller centre</option><option value="STOREFRONT">Store (shoppers)</option><option value="SELLER">Seller centre</option>
        </select>
        <select aria-label="Rating" value={rating} onChange={(e) => setRating(e.target.value)} className={input}>
          <option value="">Any rating</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>)}<option value="none">Not rated</option>
        </select>
        <select aria-label="Outcome" value={result} onChange={(e) => setResult(e.target.value)} className={input}>
          <option value="">Any outcome</option><option value="RESOLVED">Resolved</option><option value="MISSED">Missed</option><option value="TICKET">Support request</option><option value="IDLE">Timed out</option>
        </select>
        {loading ? <span className="pb-2 text-xs text-slate-400">Loading…</span> : null}
      </section>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {s ? (
        <>
          {/* headline numbers */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ["Chats", String(s.total), `${s.open} open now`],
              ["Answered", s.answerRate === null ? "—" : `${s.answerRate}%`, `${s.answered} of ${s.total}`],
              ["Missed", String(s.missed), "No agent in time"],
              ["Support requests", String(s.tickets), "Saved from chat"],
              ["Avg wait", dur(s.avgWaitSeconds), "Until an agent joined"],
              ["Avg first reply", dur(s.avgFirstReplySeconds), "After joining"],
              ["Avg chat length", dur(s.avgDurationSeconds), "Joined → ended"],
              ["Avg rating", s.avgRating === null ? "—" : `${s.avgRating} ★`, `${s.rated} ratings${s.ratingRate === null ? "" : ` · ${s.ratingRate}% rated`}`],
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-card">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
                <p className="text-[11px] text-slate-500">{hint}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            {/* rating split */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <h2 className="text-sm font-semibold">Ratings</h2>
              <div className="mt-3 space-y-2">
                {[...s.stars].reverse().map((x) => (
                  <div key={x.rating} className="flex items-center gap-2 text-sm">
                    <span className="w-10 shrink-0 font-medium">{x.rating} ★</span>
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"><span className={"block h-full rounded-full " + (x.rating >= 4 ? "bg-emerald-500" : x.rating === 3 ? "bg-amber-400" : "bg-red-500")} style={{ width: `${(x.count / maxStars) * 100}%` }} /></span>
                    <span className="w-8 shrink-0 text-right tabular-nums text-slate-600">{x.count}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* daily trend */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <h2 className="text-sm font-semibold">Chats per day</h2>
              {data.daily.length ? (
                <div className="mt-3 flex h-36 items-end gap-1 overflow-x-auto">
                  {data.daily.map((d) => (
                    <div key={d.day} className="flex min-w-[22px] flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.chats} chats, ${d.missed} missed${d.avgRating ? `, ${d.avgRating}★` : ""}`}>
                      <span className="text-[10px] tabular-nums text-slate-500">{d.chats}</span>
                      <span className="flex w-full flex-col justify-end overflow-hidden rounded-t bg-slate-100" style={{ height: `${(d.chats / maxDay) * 100}px` }}>
                        <span className="w-full bg-red-400" style={{ height: `${d.chats ? (d.missed / d.chats) * 100 : 0}%` }} />
                        <span className="w-full flex-1 bg-slate-900" />
                      </span>
                      <span className="text-[9px] text-slate-400">{d.day.slice(8)}/{d.day.slice(5, 7)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-slate-500">No chats in this range.</p>}
              <p className="mt-2 text-[11px] text-slate-500"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-900" />Answered <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm bg-red-400" />Missed</p>
            </div>
          </section>

          {/* agents */}
          <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
            <h2 className="px-4 pt-4 text-sm font-semibold">Agents</h2>
            <table className="mt-2 w-full min-w-[720px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>{["Agent", "Chats", "Resolved", "Support requests", "Avg first reply", "Avg chat length", "Avg rating", "Low ratings (1–2★)"].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.agents.length ? data.agents.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 font-medium">{a.name}</td><td className="px-4 py-2.5 tabular-nums">{a.chats}</td><td className="px-4 py-2.5 tabular-nums">{a.resolved}</td><td className="px-4 py-2.5 tabular-nums">{a.tickets}</td>
                    <td className="px-4 py-2.5">{dur(a.avgFirstReplySeconds)}</td><td className="px-4 py-2.5">{dur(a.avgDurationSeconds)}</td>
                    <td className="px-4 py-2.5">{a.avgRating === null ? "—" : <><span className="text-amber-500">★</span> {a.avgRating} <span className="text-xs text-slate-400">({a.rated})</span></>}</td>
                    <td className={"px-4 py-2.5 tabular-nums " + (a.lowRatings ? "font-semibold text-red-600" : "")}>{a.lowRatings}</td>
                  </tr>
                )) : <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No chats were picked up in this range.</td></tr>}
              </tbody>
            </table>
          </section>

          {/* every chat */}
          <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
              <h2 className="text-sm font-semibold">Chats</h2>
              <p className="text-xs text-slate-500">{data.rows.length < s.total ? `Newest ${data.rows.length} of ${s.total} shown. Download CSV for all.` : `${s.total} chat${s.total === 1 ? "" : "s"}`}</p>
            </div>
            <table className="mt-2 w-full min-w-[980px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>{["Started", "Customer / seller", "Topic", "Agent", "Wait", "First reply", "Length", "Msgs", "Outcome", "Rating", "Feedback"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.length ? data.rows.map((r) => {
                  const [label, tone] = outcome(r);
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{when(r.createdAt)}</td>
                      <td className="px-3 py-2.5"><p className="font-medium">{r.name}</p><p className="text-[11px] text-slate-500">{r.requesterType === "SELLER" ? "Seller" : r.requesterType === "GUEST" ? "Guest" : "Customer"}{r.contact ? ` · ${r.contact}` : ""}</p></td>
                      <td className="px-3 py-2.5 text-slate-600">{r.topic}</td>
                      <td className="px-3 py-2.5">{r.agent ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{dur(r.waitSeconds)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{dur(r.firstReplySeconds)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{dur(r.durationSeconds)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.messages}{r.files ? <span className="text-xs text-slate-400"> · {r.files} 📎</span> : null}</td>
                      <td className="px-3 py-2.5"><span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + tone}>{label}</span>{r.ticketNumber ? <p className="mt-0.5 text-[11px] text-slate-500">#{r.ticketNumber}</p> : null}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-amber-500">{r.rating ? starText(r.rating) : <span className="text-slate-300">—</span>}</td>
                      <td className="max-w-[240px] px-3 py-2.5 text-slate-600">{r.ratingNote ?? ""}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-500">No chats match these filters.</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </main>
  );
}
