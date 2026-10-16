"use client";

import { LIVE_CHAT_TIMING } from "@azadimart/shared";
import { ChatAttachmentView, ChatFileButton, type ChatAttachment } from "@azadimart/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Row = {
  id: string; status: "WAITING" | "ACTIVE"; topic: string; source: string; requesterType: string; name: string; agentId: string | null; agentName: string | null;
  waitedSeconds: number; lastMessage: { author: string; body: string; at: string } | null; awaitingReplySeconds: number; unread: number; requesterTyping: boolean; requesterOnline: boolean;
};
type Agent = { userId: string; name: string; status: string; active: number; maxChats: number };
type Console = {
  me: { status: "ONLINE" | "AWAY" | "OFFLINE"; maxChats: number; active: number };
  queue: Row[]; mine: Row[]; others: Row[]; agents: Agent[];
  today: { chats: number; missed: number; avgWaitSeconds: number | null; avgFirstReplySeconds: number | null; rating: number | null; rated: number };
};
type Msg = { seq: number; author: "REQUESTER" | "AGENT" | "SYSTEM"; body: string; attachment?: ChatAttachment | null; createdAt: string; agentName: string | null };
type ChatInfo = { id: string; status: string; assignedAgentId: string | null; agentName: string | null; requesterTyping: boolean; requesterReadSeq: number; requesterOnline: boolean; createdAt: string; endedAt: string | null; endReason: string | null; rating: number | null; ratingNote: string | null; ticketId: string | null };
type Context = { name: string; requesterType: string; email: string | null; phone: string | null; guestContact: string | null; page: string | null; topic: string; recentOrders?: Array<{ id: string; number: string; status: string; total: number; createdAt: string }>; seller?: { storeName: string; status: string; holdReason: string | null; liveProducts: number }; canned?: Array<{ id: string; title: string; body: string }> };
type History = { id: string; name: string; requesterType: string; topic: string; agentName: string | null; createdAt: string; endedAt: string | null; endReason: string | null; rating: number | null; ticketId: string | null; waitSeconds: number | null };

const dur = (s: number | null) => (s === null ? "–" : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
const time = (d: string) => new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN");
const STATUS: Record<string, { label: string; dot: string; on: string }> = {
  ONLINE: { label: "Online", dot: "bg-[#22c55e]", on: "bg-[#22c55e] text-white" },
  AWAY: { label: "Away", dot: "bg-amber-400", on: "bg-amber-400 text-slate-950" },
  OFFLINE: { label: "Offline", dot: "bg-slate-400", on: "bg-slate-700 text-white" },
};
const END: Record<string, string> = { RESOLVED: "Resolved", ABANDONED: "Left the queue", IDLE: "Timed out", TICKET: "Turned into request" };

function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 990, 1320].forEach((f, i) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = f; const t = ctx.currentTime + i * 0.11; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.25); });
  } catch { /* sound not available */ }
}

export default function LiveConsole({ meId }: { meId: string }) {
  const [data, setData] = useState<Console | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"live" | "history">("live");
  const [selected, setSelected] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [context, setContext] = useState<Context | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<History[] | null>(null);
  const [historyQ, setHistoryQ] = useState("");
  const [tick, setTick] = useState(0);
  const [notify, setNotify] = useState<NotificationPermission | "unsupported">("default");
  const lastSeq = useRef(0);
  const known = useRef<{ mine: Set<string>; unread: number } | null>(null);
  const typingSent = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const loadedAt = useRef(Date.now());

  useEffect(() => { setNotify(typeof Notification === "undefined" ? "unsupported" : Notification.permission); }, []);
  // Wait timers tick every second between server updates.
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  // Re-rendered every second by the ticker above.
  void tick;
  const since = Math.round((Date.now() - loadedAt.current) / 1000);

  const alert = useCallback((title: string, body: string) => {
    chime();
    if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") { try { new Notification(title, { body, tag: "azm-live-chat" }); } catch { /* not allowed */ } }
  }, []);

  // Console state (also the heartbeat that keeps me "online"): every 2 s.
  const loadConsole = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/live-chat", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message ?? "Couldn't load live chat");
      loadedAt.current = Date.now();
      setData(body); setError("");
      const mineIds = new Set<string>((body as Console).mine.map((c) => c.id));
      const unread = (body as Console).mine.reduce((s, c) => s + c.unread, 0);
      if (known.current) {
        const fresh = (body as Console).mine.filter((c) => !known.current!.mine.has(c.id));
        if (fresh.length) alert("New live chat", `${fresh[0]!.name}: ${fresh[0]!.lastMessage?.body ?? fresh[0]!.topic}`);
        else if (unread > known.current.unread) alert("New message", "A customer is waiting for your reply");
      }
      known.current = { mine: mineIds, unread };
      document.title = `${unread || (body as Console).queue.length ? `(${unread || (body as Console).queue.length}) ` : ""}Live chat · LOIMART Admin`;
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load live chat"); }
  }, [alert]);
  useEffect(() => {
    void loadConsole();
    const t = setInterval(() => void loadConsole(), 2000);
    return () => clearInterval(t);
  }, [loadConsole]);

  // The open chat: new messages every 1.5 s.
  const loadChat = useCallback(async (id: string, first: boolean) => {
    const r = await fetch(`/api/v1/live-chat/chats/${id}?after=${first ? 0 : lastSeq.current}${first ? "&context=1" : ""}`, { cache: "no-store" });
    const body = await r.json();
    if (!r.ok) return;
    setChat(body.chat);
    if (first) { setMessages(body.messages); setContext(body.context); }
    else if (body.messages.length) setMessages((m) => { const seen = new Set(m.map((x) => x.seq)); return [...m, ...body.messages.filter((x: Msg) => !seen.has(x.seq))]; });
    lastSeq.current = Math.max(first ? 0 : lastSeq.current, body.lastSeq);
  }, []);
  useEffect(() => {
    if (!selected) return;
    lastSeq.current = 0; setMessages([]); setContext(null); setChat(null); setText("");
    void loadChat(selected, true);
    const t = setInterval(() => void loadChat(selected, false), 1500);
    return () => clearInterval(t);
  }, [selected, loadChat]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length, chat?.requesterTyping]);
  // Open my first chat automatically when nothing is selected.
  useEffect(() => { if (!selected && data?.mine[0]) setSelected(data.mine[0].id); }, [data?.mine, selected]);

  async function post(path: string, body?: unknown) {
    const r = await fetch(`/api/v1/live-chat${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const res = await r.json().catch(() => null);
    if (!r.ok) throw new Error(res?.error?.message ?? "Something went wrong");
    return res;
  }
  async function act(fn: () => Promise<unknown>, done?: string) {
    setBusy(true); setNotice(""); setError("");
    try { await fn(); if (done) setNotice(done); await loadConsole(); if (selected) await loadChat(selected, true); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  }
  const setStatus = (status: string, maxChats?: number) => act(async () => setData(await post("/presence", { status, ...(maxChats ? { maxChats } : {}) })));
  async function send() {
    const body = text.trim();
    if (!body || !selected) return;
    setText("");
    const temp: Msg = { seq: -Date.now(), author: "AGENT", body, createdAt: new Date().toISOString(), agentName: "You" };
    setMessages((m) => [...m, temp]);
    try {
      const res = await post(`/chats/${selected}/messages?after=${lastSeq.current}`, { body });
      setMessages((m) => { const rest = m.filter((x) => x.seq !== temp.seq); const seen = new Set(rest.map((x) => x.seq)); return [...rest, ...res.messages.filter((x: Msg) => !seen.has(x.seq))]; });
      lastSeq.current = Math.max(lastSeq.current, res.lastSeq);
    } catch (e) { setMessages((m) => m.filter((x) => x.seq !== temp.seq)); setText(body); setError(e instanceof Error ? e.message : "Not sent"); }
  }
  /** Sends a photo or PDF to the shopper/seller, with whatever is typed as its caption. */
  async function sendFile(file: File) {
    if (!selected) return;
    const caption = text.trim();
    setText(""); setError("");
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
    const temp: Msg = { seq: -Date.now(), author: "AGENT", body: caption, createdAt: new Date().toISOString(), agentName: "You",
      attachment: { url: preview, name: file.name, mimeType: file.type, size: file.size, kind: file.type === "application/pdf" ? "DOCUMENT" : "IMAGE" } };
    setMessages((m) => [...m, temp]);
    try {
      const form = new FormData();
      form.append("file", file);
      if (caption) form.append("caption", caption);
      const r = await fetch(`/api/v1/live-chat/chats/${selected}/attachments?after=${lastSeq.current}`, { method: "POST", body: form });
      const res = await r.json().catch(() => null);
      if (!r.ok) throw new Error(res?.error?.message ?? "File not sent");
      setMessages((m) => { const rest = m.filter((x) => x.seq !== temp.seq); const seen = new Set(rest.map((x) => x.seq)); return [...rest, ...res.messages.filter((x: Msg) => !seen.has(x.seq))]; });
      lastSeq.current = Math.max(lastSeq.current, res.lastSeq);
    } catch (e) { setMessages((m) => m.filter((x) => x.seq !== temp.seq)); setText(caption); setError(e instanceof Error ? e.message : "File not sent"); }
    finally { if (preview) URL.revokeObjectURL(preview); }
  }
  function typing() {
    if (!selected || Date.now() - typingSent.current < 3000) return;
    typingSent.current = Date.now();
    void post(`/chats/${selected}/typing`).catch(() => undefined);
  }

  useEffect(() => {
    if (tab !== "history") return;
    const t = setTimeout(() => void fetch(`/api/v1/live-chat/history?q=${encodeURIComponent(historyQ)}`, { cache: "no-store" }).then((r) => r.json()).then((b) => setHistory(b.items ?? [])).catch(() => setHistory([])), 250);
    return () => clearTimeout(t);
  }, [tab, historyQ]);

  const selectedRow = useMemo(() => [...(data?.mine ?? []), ...(data?.queue ?? []), ...(data?.others ?? [])].find((c) => c.id === selected), [data, selected]);
  const mineOpen = chat?.status === "ACTIVE" && chat.assignedAgentId === meId;
  const others = (data?.agents ?? []).filter((a) => a.userId !== meId && a.status === "ONLINE" && a.active < a.maxChats);
  const me = data?.me;

  const rowItem = (c: Row, kind: "queue" | "mine" | "other") => {
    const waited = c.waitedSeconds + since;
    const awaiting = c.awaitingReplySeconds ? c.awaitingReplySeconds + since : 0;
    const late = kind === "queue" ? waited > LIVE_CHAT_TIMING.waitWarn : awaiting > LIVE_CHAT_TIMING.waitWarn;
    return (
      <li key={c.id}>
        <button type="button" onClick={() => setSelected(c.id)} className={"flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 " + (selected === c.id ? "bg-brand-50/70 ring-1 ring-inset ring-brand-200" : "")}>
          <span className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-xs font-semibold uppercase text-white">{c.name.slice(0, 2)}<span className={"absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white " + (c.requesterOnline ? "bg-[#22c55e]" : "bg-slate-300")} /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold">{c.name}</span>{c.requesterType === "SELLER" ? <span className="rounded bg-navy/10 px-1 text-[9px] font-bold uppercase text-navy">Seller</span> : c.requesterType === "GUEST" ? <span className="rounded bg-slate-100 px-1 text-[9px] font-bold uppercase text-slate-500">Guest</span> : null}</span>
            <span className="block truncate text-xs text-slate-500">{c.requesterTyping ? <i className="text-brand-700">typing…</i> : c.lastMessage ? `${c.lastMessage.author === "AGENT" ? "You: " : ""}${c.lastMessage.body}` : c.topic}</span>
            {kind === "other" ? <span className="block text-[11px] text-slate-400">with {c.agentName}</span> : null}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            {kind === "queue" ? <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums " + (late ? "bg-red-600 text-white" : "bg-amber-100 text-amber-800")}>{dur(waited)}</span> : null}
            {kind === "mine" && awaiting ? <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums " + (late ? "bg-red-600 text-white" : "bg-sky-100 text-sky-800")}>{dur(awaiting)}</span> : null}
            {c.unread && kind === "mine" ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">{c.unread}</span> : null}
          </span>
        </button>
      </li>
    );
  };

  return (
    <main className="flex h-[calc(100vh-0px)] flex-col px-4 py-4 sm:px-6 lg:px-8">
      {/* top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">Support</p>
          <h1 className="text-2xl font-semibold tracking-tight">Live chat</h1>
        </div>
        <a href="/live-chat/reports" className="order-last inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-card ring-1 ring-slate-200 hover:ring-slate-400 sm:order-none">📊 Reports &amp; download</a>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-white p-1 shadow-card ring-1 ring-slate-200" role="radiogroup" aria-label="My status">
            {(["ONLINE", "AWAY", "OFFLINE"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={me?.status === s} disabled={busy} onClick={() => void setStatus(s)} className={"flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold " + (me?.status === s ? STATUS[s]!.on : "text-slate-600 hover:text-slate-950")}>
                <span className={"h-2 w-2 rounded-full " + (me?.status === s ? "bg-white" : STATUS[s]!.dot)} />{STATUS[s]!.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm shadow-card ring-1 ring-slate-200">Max chats
            <select value={me?.maxChats ?? 3} onChange={(e) => void setStatus(me?.status ?? "ONLINE", Number(e.target.value))} className="rounded-md border-0 bg-transparent font-semibold">{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          {notify === "default" ? <button type="button" onClick={() => void Notification.requestPermission().then(setNotify)} className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-card ring-1 ring-slate-200 hover:ring-slate-900">Turn on desktop alerts</button> : null}
        </div>
      </div>

      {/* today */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ["Waiting now", String(data?.queue.length ?? 0), (data?.queue.length ?? 0) > 0 ? "text-red-600" : ""],
          ["Agents online", String((data?.agents ?? []).filter((a) => a.status === "ONLINE").length), ""],
          ["Chats today", String(data?.today.chats ?? 0), ""],
          ["Avg wait today", dur(data?.today.avgWaitSeconds ?? null), (data?.today.avgWaitSeconds ?? 0) > LIVE_CHAT_TIMING.waitWarn ? "text-red-600" : "text-india"],
          ["Avg first reply", dur(data?.today.avgFirstReplySeconds ?? null), ""],
          ["Missed · rating", `${data?.today.missed ?? 0} · ${data?.today.rating ?? "–"}${data?.today.rated ? "★" : ""}`, (data?.today.missed ?? 0) > 0 ? "text-amber-700" : ""],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-card"><p className="text-[11px] font-medium text-slate-500">{label}</p><p className={"text-lg font-semibold tabular-nums " + tone}>{value}</p></div>
        ))}
      </div>

      {error ? <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mt-3 rounded-xl bg-india-light px-4 py-2 text-sm text-india-dark">{notice}</p> : null}
      {me && me.status !== "ONLINE" ? <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">You&apos;re <b>{STATUS[me.status]!.label.toLowerCase()}</b>: new chats won&apos;t come to you. Switch to Online to take chats.</p> : null}

      <div className="mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        {/* left: queue and chats */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <div className="flex border-b border-slate-100 p-1 text-sm font-semibold">
            {(["live", "history"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={"flex-1 rounded-xl py-1.5 " + (tab === t ? "bg-slate-950 text-white" : "text-slate-500")}>{t === "live" ? "Chats" : "History"}</button>)}
          </div>
          {tab === "live" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <p className="flex items-center justify-between px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Waiting <span className={(data?.queue.length ?? 0) ? "text-red-600" : ""}>{data?.queue.length ?? 0}</span></p>
              {data?.queue.length ? <ul>{data.queue.map((c) => rowItem(c, "queue"))}</ul> : <p className="px-3 pb-2 text-xs text-slate-400">Nobody waiting.</p>}
              <p className="flex items-center justify-between px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">My chats <span>{me?.active ?? 0}/{me?.maxChats ?? 3}</span></p>
              {data?.mine.length ? <ul>{data.mine.map((c) => rowItem(c, "mine"))}</ul> : <p className="px-3 pb-2 text-xs text-slate-400">{me?.status === "ONLINE" ? "New chats come to you automatically." : "Go online to receive chats."}</p>}
              {data?.others.length ? <>
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Team&apos;s chats</p>
                <ul>{data.others.map((c) => rowItem(c, "other"))}</ul>
              </> : null}
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Online now</p>
              <ul className="px-3 pb-3 text-xs">{(data?.agents ?? []).map((a) => <li key={a.userId} className="flex items-center justify-between py-1"><span className="flex items-center gap-1.5"><span className={"h-2 w-2 rounded-full " + (STATUS[a.status]?.dot ?? "bg-slate-300")} />{a.name}{a.userId === meId ? " (you)" : ""}</span><span className="tabular-nums text-slate-500">{a.active}/{a.maxChats}</span></li>)}</ul>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="p-2"><input value={historyQ} onChange={(e) => setHistoryQ(e.target.value)} placeholder="Search name, topic or agent" className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></div>
              <ul className="divide-y divide-slate-100">
                {history?.map((h) => (
                  <li key={h.id}><button type="button" onClick={() => setSelected(h.id)} className={"w-full px-3 py-2 text-left hover:bg-slate-50 " + (selected === h.id ? "bg-brand-50/70" : "")}>
                    <span className="flex justify-between gap-2 text-sm font-semibold"><span className="truncate">{h.name}</span>{h.rating ? <span className="shrink-0 text-brand-600">{"★".repeat(h.rating)}</span> : null}</span>
                    <span className="block truncate text-xs text-slate-500">{h.topic} · {END[h.endReason ?? ""] ?? h.endReason} · {h.agentName ?? "no agent"}</span>
                    <span className="block text-[11px] text-slate-400">{new Date(h.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} · wait {dur(h.waitSeconds)}</span>
                  </button></li>
                ))}
                {history && !history.length ? <li className="px-3 py-4 text-xs text-slate-400">No past chats.</li> : null}
              </ul>
            </div>
          )}
        </aside>

        {/* centre: conversation */}
        <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
          {!selected ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <p className="text-lg font-semibold">{me?.status === "ONLINE" ? "You're online" : "Ready when you are"}</p>
                <p className="mt-1 max-w-sm text-sm text-slate-500">{me?.status === "ONLINE" ? "New chats are assigned to you automatically and open here, with a sound." : "Switch to Online at the top to start receiving chats."}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{context?.name ?? selectedRow?.name ?? "…"} <span className="ml-1 text-xs font-normal text-slate-500">{context?.topic ?? selectedRow?.topic}</span></p>
                  <p className="text-xs text-slate-500">{chat?.status === "ENDED" ? `Ended · ${END[chat.endReason ?? ""] ?? ""}${chat.rating ? ` · rated ${"★".repeat(chat.rating)}` : ""}` : chat?.requesterTyping ? <i className="text-brand-700">typing…</i> : chat?.requesterOnline ? "On the chat now" : "Not looking at the chat right now"}{chat?.status === "ACTIVE" && !mineOpen ? ` · with ${chat.agentName}` : ""}</p>
                </div>
                {chat?.status === "WAITING" ? <button type="button" disabled={busy} onClick={() => void act(() => post(`/chats/${selected}/take`), "Chat taken.")} className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white">Take this chat</button> : null}
                {mineOpen ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {others.length ? (
                      <select value="" disabled={busy} onChange={(e) => { if (e.target.value) void act(() => post(`/chats/${selected}/transfer`, { agentUserId: e.target.value }), "Chat transferred."); }} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold" aria-label="Transfer">
                        <option value="">Transfer…</option>{others.map((a) => <option key={a.userId} value={a.userId}>{a.name} ({a.active}/{a.maxChats})</option>)}
                      </select>
                    ) : null}
                    <button type="button" disabled={busy} onClick={() => { const note = prompt("Turn this chat into a support request for follow-up. Add a note for the team (optional):", ""); if (note !== null) void act(() => post(`/chats/${selected}/ticket`, { note }), "Saved as a support request; the customer was told."); }} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:border-slate-900">Make support request</button>
                    <button type="button" disabled={busy} onClick={() => { if (confirm("End this chat?")) void act(() => post(`/chats/${selected}/end`), "Chat ended."); }} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">End chat</button>
                  </div>
                ) : null}
              </div>
              <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-slate-50 px-4 py-4">
                {messages.map((m) => m.author === "SYSTEM" ? <p key={m.seq} className="text-center text-[11px] text-slate-500">{m.body} · {time(m.createdAt)}</p> : (
                  <div key={m.seq} className={"flex " + (m.author === "AGENT" ? "justify-end" : "justify-start")}>
                    <div className={"max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-6 " + (m.author === "AGENT" ? "rounded-br-md bg-navy text-white" : "rounded-bl-md border border-slate-200 bg-white shadow-sm")}>
                      {m.author === "AGENT" && m.agentName && m.agentName !== "You" && chat?.assignedAgentId !== meId ? <p className="text-[11px] font-semibold text-white/70">{m.agentName}</p> : null}
                      {m.attachment ? <div className="my-1">{m.attachment.url ? <ChatAttachmentView file={m.attachment} mine={m.author === "AGENT"} /> : <p className="text-xs opacity-80">📄 {m.attachment.name}</p>}</div> : null}
                      {m.body ? <p className="whitespace-pre-wrap">{m.body}</p> : null}
                      <p className={"mt-0.5 text-right text-[10px] " + (m.author === "AGENT" ? "text-white/60" : "text-slate-400")}>{m.seq < 0 ? "Sending…" : time(m.createdAt)}{m.author === "AGENT" && m.seq > 0 && (chat?.requesterReadSeq ?? 0) >= m.seq ? " · Seen" : ""}</p>
                    </div>
                  </div>
                ))}
                {chat?.requesterTyping ? <div className="flex"><span className="flex gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 120}ms` }} />)}</span></div> : null}
              </div>
              {mineOpen ? (
                <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="border-t border-slate-100 p-3">
                  {context?.canned?.length ? (
                    <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                      {context.canned.map((c) => <button key={c.id} type="button" onClick={() => setText((t) => (t ? t + "\n" : "") + c.body.replace(/\{name\}/g, (context.name || "there").split(" ")[0]!))} className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-900">{c.title}</button>)}
                    </div>
                  ) : null}
                  <div className="flex items-end gap-2">
                    <ChatFileButton onFile={(f) => void sendFile(f)} onError={setError} className="mb-1" />
                    <textarea value={text} rows={2} maxLength={2000} onChange={(e) => { setText(e.target.value); typing(); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Type a reply… (Enter to send, Shift+Enter for a new line)" className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy" />
                    <button type="submit" disabled={!text.trim()} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">Send</button>
                  </div>
                </form>
              ) : chat?.status === "ENDED" && chat.ratingNote ? <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">Feedback: “{chat.ratingNote}”</p> : null}
            </>
          )}
        </section>

        {/* right: who it is */}
        <aside className="hidden min-h-0 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card xl:block">
          {context ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{context.requesterType === "SELLER" ? "Seller" : context.requesterType === "GUEST" ? "Guest" : "Customer"}</p>
              <p className="mt-1 text-lg font-semibold">{context.name}</p>
              <dl className="mt-3 space-y-1.5 text-sm">
                {context.email ? <div><dt className="text-xs text-slate-500">Email</dt><dd className="break-all">{context.email}</dd></div> : null}
                {context.phone ? <div><dt className="text-xs text-slate-500">Phone</dt><dd>{context.phone}</dd></div> : null}
                {context.guestContact ? <div><dt className="text-xs text-slate-500">Contact</dt><dd className="break-all">{context.guestContact}</dd></div> : null}
                {context.page ? <div><dt className="text-xs text-slate-500">Chatting from</dt><dd className="break-all font-mono text-xs">{context.page}</dd></div> : null}
              </dl>
              {context.seller ? (
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="font-semibold">{context.seller.storeName}</p>
                  <p className="text-xs text-slate-500">{context.seller.status.toLowerCase()} · {context.seller.liveProducts} live products</p>
                  {context.seller.holdReason ? <p className="mt-1 text-xs text-red-700">Payout hold: {context.seller.holdReason}</p> : null}
                </div>
              ) : null}
              {context.recentOrders?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500">Recent orders</p>
                  <ul className="mt-1 divide-y divide-slate-100 text-sm">
                    {context.recentOrders.map((o) => <li key={o.id} className="py-1.5"><a href={`/orders?q=${encodeURIComponent(o.number)}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">{o.number}</a><span className="block text-xs text-slate-500">{o.status.replaceAll("_", " ").toLowerCase()} · {money(o.total)} · {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></li>)}
                  </ul>
                </div>
              ) : null}
            </>
          ) : <p className="text-sm text-slate-400">Customer details show here.</p>}
        </aside>
      </div>
    </main>
  );
}
