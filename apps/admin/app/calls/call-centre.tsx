"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Caller = { phone: string; customer: { id: string; name: string; email: string } | null; seller: { id: string; name: string } | null; orders: Array<{ id: string; orderNumber: string; status: string; totalPaise: number; createdAt: string }>; openTickets: Array<{ id: string; number: number; subject: string; status: string }>; previousCalls: number };
type Current = { id: string; direction: "INBOUND" | "OUTBOUND"; status: "RINGING" | "IN_PROGRESS"; customerPhone: string; ivrChoice: string | null; answeredAt: string | null; createdAt: string; orderId: string | null; ticketId: string | null; caller: Caller };
type State = { status: "AVAILABLE" | "AWAY" | "OFFLINE"; current: Current | null; queue: number; missed: number; agentsOnline: number; line: { name: "test" | "exotel"; number: string | null } | null };
type Row = { id: string; direction: "INBOUND" | "OUTBOUND"; status: string; customerPhone: string; ivrChoice: string | null; createdAt: string; durationSeconds: number | null; waitSeconds: number | null; outcome: string | null; notes: string | null; recordingUrl: string | null; agentEmail: string | null; customerName: string | null; sellerName: string | null; callbackDoneAt: string | null };
type Stats = { inboundTotal: number; inboundAnswered: number; missed: number; outbound: number; outboundConnected: number; avgWaitSeconds: number; avgTalkSeconds: number; agents: Array<{ userId: string; email: string; inbound: number; outbound: number; talkSeconds: number }> };

const rs = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;
const IVR: Record<string, string> = { ORDERS: "Orders", SELLERS: "Sellers", OTHER: "Other" };
const OUTCOMES = [["RESOLVED", "Resolved"], ["FOLLOW_UP", "Needs follow-up"], ["ESCALATED", "Escalated"], ["WRONG_NUMBER", "Wrong number"], ["NO_RESPONSE", "No response"]] as const;
const STATUS_LABEL: Record<string, string> = { COMPLETED: "Answered", MISSED: "Missed", NO_ANSWER: "No answer", FAILED: "Failed", RINGING: "Ringing", IN_PROGRESS: "On call", QUEUED: "Waiting" };

async function api(path: string, init?: { method?: string; body?: unknown }) {
  const r = await fetch(path, { method: init?.method ?? "GET", headers: init?.body ? { "Content-Type": "application/json" } : undefined, body: init?.body ? JSON.stringify(init.body) : undefined, cache: "no-store" });
  const b = await r.json().catch(() => null);
  if (!r.ok) throw new Error(b?.error?.details?.[0]?.message ?? b?.error?.message ?? "Something went wrong");
  return b;
}

/** The support team's softphone: go available, answer and make calls, see who's calling, write notes. */
export default function CallCentre() {
  const params = useSearchParams();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [dial, setDial] = useState(params.get("dial")?.replace(/\D/g, "").slice(-10) ?? "");
  const [dialCaller, setDialCaller] = useState<Caller | null>(null);
  const [lastEnded, setLastEnded] = useState<{ id: string; phone: string; name: string | null } | null>(null);
  const [muted, setMuted] = useState(false);
  const [tab, setTab] = useState<"recent" | "missed" | "today">("recent");
  const [refresh, setRefresh] = useState(0);
  const prev = useRef<Current | null>(null);

  const poll = useCallback(async () => {
    try {
      const s: State = await api("/api/v1/calls/state");
      // A call that just ended on this screen: ask for notes.
      if (prev.current && (!s.current || s.current.id !== prev.current.id) && prev.current.status === "IN_PROGRESS") {
        setLastEnded({ id: prev.current.id, phone: prev.current.customerPhone, name: prev.current.caller.customer?.name ?? prev.current.caller.seller?.name ?? null });
        setRefresh((n) => n + 1);
      }
      prev.current = s.current;
      setState(s); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Lost connection"); }
  }, []);
  useEffect(() => { void poll(); const t = setInterval(() => void poll(), 2500); const c = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(t); clearInterval(c); }; }, [poll]);

  // Who the number in the dialler belongs to.
  useEffect(() => {
    if (dial.length !== 10) { setDialCaller(null); return; }
    const t = setTimeout(() => { void api(`/api/v1/calls/lookup?phone=${dial}`).then(setDialCaller).catch(() => setDialCaller(null)); }, 300);
    return () => clearTimeout(t);
  }, [dial]);

  const act = async (fn: () => Promise<unknown>) => { setError(""); try { await fn(); await poll(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } };
  const setStatus = (status: State["status"]) => act(() => api("/api/v1/calls/agent", { method: "PUT", body: { status } }));
  const call = (phone: string) => act(async () => { await api("/api/v1/calls", { method: "POST", body: { phone, orderId: params.get("order") || null, ticketId: params.get("ticket") || null } }); setLastEnded(null); });
  const callAction = (id: string, action: string) => act(() => api(`/api/v1/calls/${id}`, { method: "PATCH", body: { action } }));

  if (!state) return <main className="p-10 text-sm text-slate-500">{error || "Connecting to the call centre…"}</main>;
  const c = state.current;
  const caller = c?.caller ?? dialCaller;
  const talk = c?.answeredAt ? (now - new Date(c.answeredAt).getTime()) / 1000 : 0;
  const ringFor = c ? (now - new Date(c.createdAt).getTime()) / 1000 : 0;
  const chip = (on: boolean, tone: string) => "rounded-full px-4 py-2 text-sm font-semibold " + (on ? tone : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900");

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Support" title="Call centre" description="Take and make customer-service calls with a headset. Customers always see LOIMART's number, never yours. Calls are recorded once the phone provider is connected." />
      {!state.line ? <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Calling isn&apos;t connected.</b> Set up LOIMART&apos;s phone provider (Exotel) to make and receive real calls.</p>
        : state.line.name === "test" ? <p className="mt-5 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900"><b>Test mode:</b> calls are simulated; no real phone rings. Use &ldquo;Simulate an incoming call&rdquo; to try it. Connect Exotel to go live.</p> : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold">My status</span>
        <button type="button" onClick={() => void setStatus("AVAILABLE")} className={chip(state.status === "AVAILABLE", "bg-green-600 text-white")}>● Available</button>
        <button type="button" onClick={() => void setStatus("AWAY")} className={chip(state.status === "AWAY", "bg-amber-500 text-white")}>Away</button>
        <button type="button" onClick={() => void setStatus("OFFLINE")} className={chip(state.status === "OFFLINE", "bg-slate-700 text-white")}>Offline</button>
        <span className="ml-auto flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white px-3 py-1.5 font-semibold ring-1 ring-slate-200">{state.queue} waiting</span>
          <span className={"rounded-full px-3 py-1.5 font-semibold ring-1 " + (state.missed ? "bg-red-50 text-red-700 ring-red-200" : "bg-white ring-slate-200")}>{state.missed} to call back</span>
          <span className="rounded-full bg-white px-3 py-1.5 font-semibold ring-1 ring-slate-200">{state.agentsOnline} agent{state.agentsOnline === 1 ? "" : "s"} available</span>
        </span>
      </div>
      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Softphone */}
        <section className="h-fit border border-slate-200 bg-white shadow-card">
          {c ? (
            <div className={"p-6 text-white " + (c.status === "RINGING" ? "bg-gradient-to-br from-green-600 to-emerald-700" : "bg-slate-900")}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{c.status === "RINGING" ? (c.direction === "INBOUND" ? "Incoming call" : "Calling…") : "On call"}{c.ivrChoice ? ` · ${IVR[c.ivrChoice] ?? c.ivrChoice}` : ""}</p>
              <p className="mt-2 text-2xl font-bold">{c.caller.customer?.name ?? c.caller.seller?.name ?? "Unknown caller"}</p>
              <p className="font-mono text-lg opacity-90">+91 {c.customerPhone.replace(/(\d{5})(\d{5})/, "$1 $2")}</p>
              <p className="mt-3 text-4xl font-black tabular-nums">{c.status === "IN_PROGRESS" ? mmss(talk) : mmss(ringFor)}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {c.status === "RINGING" && c.direction === "INBOUND" ? <>
                  <button type="button" onClick={() => void callAction(c.id, "ACCEPT")} className="flex-1 rounded-full bg-white px-5 py-3 text-sm font-bold text-green-700">Answer</button>
                  <button type="button" onClick={() => void callAction(c.id, "DECLINE")} className="rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white">Decline</button>
                </> : <>
                  {c.status === "IN_PROGRESS" ? <button type="button" onClick={() => setMuted((m) => !m)} className={"rounded-full px-5 py-3 text-sm font-bold " + (muted ? "bg-amber-400 text-slate-900" : "bg-white/15 text-white")}>{muted ? "Unmute" : "Mute"}</button> : null}
                  <button type="button" onClick={() => void callAction(c.id, "HANGUP")} className="flex-1 rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white">{c.status === "RINGING" ? "Cancel" : "Hang up"}</button>
                </>}
              </div>
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm font-semibold">Make a call</p>
              <div className="mt-2 flex items-center rounded-lg border border-slate-300 focus-within:border-slate-900">
                <span className="pl-3 text-sm text-slate-500">+91</span>
                <input inputMode="tel" value={dial} onChange={(e) => setDial(e.target.value.replace(/\D/g, "").slice(-10))} placeholder="10-digit mobile" className="w-full bg-transparent px-2 py-3 font-mono text-lg outline-none" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k) => k ? <button key={k} type="button" onClick={() => setDial((d) => (k === "⌫" ? d.slice(0, -1) : (d + k).slice(0, 10)))} className="rounded-lg bg-slate-50 py-3 text-lg font-semibold hover:bg-slate-100">{k}</button> : <span key="gap" />)}
              </div>
              <button type="button" disabled={dial.length !== 10 || !state.line} onClick={() => void call(dial)} className="mt-4 w-full rounded-full bg-green-600 py-3 text-sm font-bold text-white disabled:opacity-40">📞 Call</button>
              {state.status !== "AVAILABLE" ? <p className="mt-3 text-xs text-slate-500">Go <b>Available</b> to receive incoming calls.</p> : null}
            </div>
          )}
          {lastEnded && !c ? <NotesForm call={lastEnded} onDone={() => { setLastEnded(null); setRefresh((n) => n + 1); }} /> : null}
          {state.line?.name === "test" && !c ? <Simulator onDone={() => void poll()} /> : null}
        </section>

        {/* Caller details */}
        <section className="border border-slate-200 bg-white p-6 shadow-card">
          {!caller ? <p className="text-sm text-slate-500">When a call comes in (or you type a number), the customer&apos;s details, orders and open requests show here.</p> : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{caller.customer ? "Customer" : caller.seller ? "Seller" : "Not a LOIMART account"}</p>
              <p className="mt-1 text-xl font-bold">{caller.customer?.name ?? caller.seller?.name ?? "+91 " + caller.phone}</p>
              <p className="text-sm text-slate-500">+91 {caller.phone}{caller.customer?.email ? ` · ${caller.customer.email}` : ""}{caller.previousCalls ? ` · ${caller.previousCalls} earlier call${caller.previousCalls === 1 ? "" : "s"}` : " · first call"}</p>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold">Recent orders</p>
                  {caller.orders.length ? <ul className="mt-2 space-y-2">{caller.orders.map((o) => <li key={o.id}><Link href={`/orders?q=${o.orderNumber}`} className="flex justify-between gap-2 border border-slate-200 px-3 py-2 text-sm hover:border-slate-900"><span className="font-mono text-xs">{o.orderNumber}</span><span className="text-xs">{o.status.replaceAll("_", " ").toLowerCase()} · <b>{rs(o.totalPaise)}</b></span></Link></li>)}</ul> : <p className="mt-1 text-sm text-slate-500">No orders.</p>}
                </div>
                <div>
                  <p className="text-sm font-semibold">Open requests</p>
                  {caller.openTickets.length ? <ul className="mt-2 space-y-2">{caller.openTickets.map((t) => <li key={t.id}><Link href={`/support/${t.id}`} className="block border border-slate-200 px-3 py-2 text-sm hover:border-slate-900"><b>#{t.number}</b> {t.subject}</Link></li>)}</ul> : <p className="mt-1 text-sm text-slate-500">None open.</p>}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="mt-8 flex gap-1 border-b border-slate-200">
        {([["recent", "Recent calls"], ["missed", `Missed · call back${state.missed ? ` (${state.missed})` : ""}`], ["today", "Today"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setTab(v)} className={"-mb-px border-b-2 px-4 py-2 text-sm font-semibold " + (tab === v ? "border-slate-900" : "border-transparent text-slate-500 hover:text-slate-900")}>{l}</button>)}
      </div>
      {tab === "today" ? <TodayStats key={refresh} /> : <CallList key={tab + refresh} view={tab} onCall={(p) => { setDial(p); void call(p); }} onDismiss={(id) => void callAction(id, "DISMISS").then(() => setRefresh((n) => n + 1))} />}
    </main>
  );
}

function NotesForm({ call, onDone }: { call: { id: string; phone: string; name: string | null }; onDone: () => void }) {
  const [outcome, setOutcome] = useState("RESOLVED");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { await api(`/api/v1/calls/${call.id}`, { method: "PATCH", body: { action: "NOTES", outcome, notes } }); onDone(); } finally { setBusy(false); } }
  return (
    <div className="border-t border-slate-200 bg-amber-50/60 p-5">
      <p className="text-sm font-semibold">Call ended · {call.name ?? "+91 " + call.phone}</p>
      <p className="text-xs text-slate-500">Add what happened, so the next agent knows.</p>
      <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="e.g. Customer asked about delivery date; told them 2 days." className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      <div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Save notes</button><button type="button" onClick={onDone} className="text-sm text-slate-500">Skip</button></div>
    </div>
  );
}

function Simulator({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState("9000000011");
  const [ivr, setIvr] = useState("ORDERS");
  const [msg, setMsg] = useState("");
  async function go() { setMsg(""); try { await api("/api/v1/calls/simulate", { method: "POST", body: { phone, ivrChoice: ivr } }); setMsg("Ringing the next available agent…"); onDone(); } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't simulate"); } }
  return (
    <div className="border-t border-dashed border-purple-200 bg-purple-50/50 p-5">
      <p className="text-sm font-semibold text-purple-900">Simulate an incoming call (test)</p>
      <div className="mt-2 flex gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 font-mono text-sm" />
        <select value={ivr} onChange={(e) => setIvr(e.target.value)} className="rounded-lg border border-purple-200 bg-white px-2 py-2 text-sm"><option value="ORDERS">Pressed 1 · Orders</option><option value="SELLERS">Pressed 2 · Sellers</option><option value="OTHER">Pressed 3 · Other</option></select>
      </div>
      <button type="button" onClick={() => void go()} className="mt-2 rounded-full bg-purple-700 px-4 py-2 text-sm font-semibold text-white">Ring</button>
      {msg ? <p className="mt-2 text-xs text-purple-900">{msg}</p> : null}
      <p className="mt-2 text-[11px] text-purple-800/80">9000000011 is the demo customer. An unanswered call goes to the next agent after 25 s and becomes a missed call after 2 minutes.</p>
    </div>
  );
}

function CallList({ view, onCall, onDismiss }: { view: "recent" | "missed"; onCall: (phone: string) => void; onDismiss: (id: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { const t = setTimeout(() => { void api(`/api/v1/calls?view=${view}&q=${encodeURIComponent(q)}`).then((b) => setRows(b.items)).catch(() => setRows([])); }, 250); return () => clearTimeout(t); }, [view, q]);
  return (
    <section className="mt-4 border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-100 p-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or name" className="w-full max-w-xs rounded-full border border-slate-300 px-4 py-2 text-sm" /></div>
      {!rows ? <p className="p-6 text-sm text-slate-500">Loading…</p> : !rows.length ? <p className="p-8 text-center text-sm text-slate-500">{view === "missed" ? "Nobody is waiting for a callback." : "No calls yet."}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2.5">When</th><th className="px-3">Caller</th><th className="px-3">Type</th><th className="px-3">Result</th><th className="px-3">Agent</th><th className="px-3">Notes</th><th className="px-5" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-5 py-3 text-xs text-slate-600">{new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                  <td className="px-3 py-3"><span className="font-semibold">{r.customerName ?? r.sellerName ?? "Unknown"}</span><span className="block font-mono text-xs text-slate-500">+91 {r.customerPhone}</span></td>
                  <td className="px-3 py-3 text-xs">{r.direction === "INBOUND" ? "↙ Incoming" : "↗ Outgoing"}{r.ivrChoice ? <span className="block text-slate-500">{IVR[r.ivrChoice] ?? r.ivrChoice}</span> : null}</td>
                  <td className="px-3 py-3 text-xs"><span className={"font-semibold " + (r.status === "MISSED" || r.status === "FAILED" ? "text-red-700" : r.status === "COMPLETED" ? "text-green-700" : "")}>{STATUS_LABEL[r.status] ?? r.status}</span>{r.durationSeconds ? <span className="block text-slate-500">{mmss(r.durationSeconds)} talk</span> : null}{r.recordingUrl ? <a href={r.recordingUrl} target="_blank" rel="noreferrer" className="block text-brand-700 underline">Recording</a> : null}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{r.agentEmail ?? "—"}</td>
                  <td className="max-w-xs px-3 py-3 text-xs">{r.outcome ? <b>{OUTCOMES.find(([v]) => v === r.outcome)?.[1]}</b> : null}{r.notes ? <span className="block text-slate-600">{r.notes}</span> : null}</td>
                  <td className="px-5 py-3 text-right"><span className="flex justify-end gap-2"><button type="button" onClick={() => onCall(r.customerPhone)} className="rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white">Call back</button>{view === "missed" ? <button type="button" onClick={() => onDismiss(r.id)} className="rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-slate-300">Dismiss</button> : null}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TodayStats() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { void api("/api/v1/calls/stats").then(setS).catch(() => undefined); }, []);
  if (!s) return <p className="mt-4 text-sm text-slate-500">Loading…</p>;
  const cards: Array<[string, string]> = [["Incoming answered", `${s.inboundAnswered} / ${s.inboundTotal}`], ["Missed", String(s.missed)], ["Outgoing connected", `${s.outboundConnected} / ${s.outbound}`], ["Average wait", mmss(s.avgWaitSeconds)], ["Average talk", mmss(s.avgTalkSeconds)]];
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-5">{cards.map(([l, v]) => <div key={l} className="border border-slate-200 bg-white p-4 shadow-card"><p className="text-xs text-slate-500">{l}</p><p className="mt-1 text-xl font-bold">{v}</p></div>)}</div>
      <section className="border border-slate-200 bg-white shadow-card">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2.5">Agent</th><th className="px-3 text-right">Incoming answered</th><th className="px-3 text-right">Outgoing</th><th className="px-5 text-right">Talk time</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{s.agents.length ? s.agents.map((a) => <tr key={a.userId}><td className="px-5 py-2.5">{a.email}</td><td className="px-3 text-right">{a.inbound}</td><td className="px-3 text-right">{a.outbound}</td><td className="px-5 text-right">{mmss(a.talkSeconds)}</td></tr>) : <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No calls handled today.</td></tr>}</tbody></table>
      </section>
    </div>
  );
}
