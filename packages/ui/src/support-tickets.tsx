"use client";

import { SUPPORT_STATUS_LABELS, supportCategoryLabel, type SupportStatus } from "@azadimart/shared";
import { useCallback, useEffect, useState } from "react";
import { HELP_CHAT_OPEN_EVENT } from "./help-chat";

type TicketRow = { id: string; number: number; category: string; subject: string; status: SupportStatus; body: string; lastMessageAt: string; lastReplyBy: string; unread: boolean; rating: number | null; createdAt: string };
type ThreadMessage = { id: string; authorType: "REQUESTER" | "STAFF" | "BOT" | "SYSTEM"; message: string; createdAt: string };

const STATUS_TONE: Record<SupportStatus, string> = {
  OPEN: "bg-sky-50 text-sky-700 ring-sky-200",
  IN_PROGRESS: "bg-brand-50 text-brand-700 ring-brand-200",
  WAITING: "bg-amber-50 text-amber-800 ring-amber-200",
  RESOLVED: "bg-india-light text-india-dark ring-india/20",
  CLOSED: "bg-slate-100 text-slate-600 ring-slate-200",
};

const when = (d: string) => {
  const date = new Date(d);
  const mins = (Date.now() - date.getTime()) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric", timeZone: "Asia/Kolkata" });
};
const stamp = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function SupportStatusPill({ status }: { status: SupportStatus }) {
  return <span className={"inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset " + STATUS_TONE[status]}>{SUPPORT_STATUS_LABELS[status]}</span>;
}

/** The requester's list of support requests, with a form to start a new one. */
export function SupportTicketList({ apiBase, ticketsPath, categories }: { apiBase: string; ticketsPath: string; categories: Array<{ key: string; label: string }> }) {
  const [items, setItems] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ category: categories[0]?.key ?? "OTHER", subject: "", message: "" });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void fetch(`${apiBase}/tickets`, { cache: "no-store" }).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message ?? "Couldn't load your requests");
      setItems(body.items);
    }).catch((e: Error) => setError(e.message));
  }, [apiBase]);

  async function create() {
    setSending(true); setError("");
    try {
      const r = await fetch(`${apiBase}/tickets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message ?? "Couldn't send your request");
      window.location.href = `${ticketsPath}/${body.ticket.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your request");
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(HELP_CHAT_OPEN_EVENT))} className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-soft">Chat with the assistant</button>
        <button type="button" onClick={() => setCreating((v) => !v)} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:border-slate-900">{creating ? "Cancel" : "Write to support"}</button>
      </div>

      {creating ? (
        <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <label className="text-sm font-medium">Topic
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Subject
            <input required minLength={3} maxLength={120} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="In a few words" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="text-sm font-medium sm:col-span-2">What happened?
            <textarea required maxLength={4000} rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Include order numbers, dates and anything that helps us help you faster." className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <div className="flex items-center justify-end gap-3 sm:col-span-2">
            <button type="submit" disabled={sending} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{sending ? "Sending…" : "Send to support"}</button>
          </div>
        </form>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {items === null && !error ? <p className="px-5 py-10 text-center text-sm text-slate-500">Loading…</p> : null}
        {items?.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="font-semibold">No support requests yet</p>
            <p className="mt-1 text-sm text-slate-500">Most questions are answered instantly by the assistant. If you need a person, we&apos;re here.</p>
          </div>
        ) : null}
        <ul className="divide-y divide-slate-100">
          {items?.map((t) => (
            <li key={t.id}>
              <a href={`${ticketsPath}/${t.id}`} className="flex items-start gap-3 px-4 py-4 transition hover:bg-slate-50 sm:px-5">
                <span className={"mt-2 h-2 w-2 shrink-0 rounded-full " + (t.unread ? "bg-brand" : "bg-transparent")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={"truncate " + (t.unread ? "font-semibold" : "font-medium")}>{t.subject}</span>
                    {t.unread ? <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">New reply</span> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-slate-500">#{t.number} · {supportCategoryLabel(t.category)} · {when(t.lastMessageAt)}</span>
                </span>
                <SupportStatusPill status={t.status} />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** One support request: the conversation, a reply box, "solved" and a rating. */
export function SupportTicketView({ apiBase, ticketId, backHref, teamName = "AzadiMart support" }: { apiBase: string; ticketId: string; backHref: string; teamName?: string }) {
  const [data, setData] = useState<{ ticket: TicketRow & { resolvedAt: string | null }; messages: ThreadMessage[] } | null>(null);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async (init?: RequestInit) => {
    const r = await fetch(`${apiBase}/tickets/${ticketId}`, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const body = await r.json();
    if (!r.ok) throw new Error(body?.error?.message ?? "Couldn't load this request");
    setData(body);
  }, [apiBase, ticketId]);
  useEffect(() => { load().catch((e: Error) => setError(e.message)); }, [load]);

  async function act(init: RequestInit) {
    setBusy(true); setError("");
    try { await load(init); return true; } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); return false; } finally { setBusy(false); }
  }

  if (!data) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{error || "Loading…"}</div>;
  const { ticket, messages } = data;
  const done = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  return (
    <div className="space-y-4">
      <a href={backHref} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-950">← All requests</a>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Request #{ticket.number} · {supportCategoryLabel(ticket.category)}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-slate-500">Opened {stamp(ticket.createdAt)}</p>
          </div>
          <SupportStatusPill status={ticket.status} />
        </div>
        {ticket.status === "WAITING" ? <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Our team replied and is waiting for your answer.</p> : null}
      </div>

      <ol className="space-y-3" aria-label="Conversation">
        {messages.map((m) => m.authorType === "SYSTEM" ? (
          <li key={m.id} className="text-center text-xs text-slate-500">{m.message} · {stamp(m.createdAt)}</li>
        ) : (
          <li key={m.id} className={"flex " + (m.authorType === "REQUESTER" ? "justify-end" : "justify-start")}>
            <div className={"max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[75%] " + (m.authorType === "REQUESTER" ? "rounded-br-md bg-navy text-white" : "rounded-bl-md border border-slate-200 bg-white shadow-sm")}>
              <p className={"mb-1 text-xs font-semibold " + (m.authorType === "REQUESTER" ? "text-white/70" : "text-brand-700")}>{m.authorType === "REQUESTER" ? "You" : teamName} · {stamp(m.createdAt)}</p>
              <p className="whitespace-pre-wrap">{m.message}</p>
            </div>
          </li>
        ))}
      </ol>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {ticket.status !== "CLOSED" ? (
        <form onSubmit={async (e) => { e.preventDefault(); if (reply.trim() && await act({ method: "POST", body: JSON.stringify({ message: reply }) })) setReply(""); }} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="text-sm font-medium" htmlFor="ticket-reply">{done ? "Still need help? Reply to reopen this request" : "Reply"}</label>
          <textarea id="ticket-reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={4000} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="Write your message…" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {!done ? <button type="button" disabled={busy} onClick={() => void act({ method: "PATCH", body: JSON.stringify({ status: "RESOLVED" }) })} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:border-india hover:text-india-dark">My problem is solved</button> : <span />}
            <button type="submit" disabled={busy || !reply.trim()} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
          </div>
        </form>
      ) : <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">This request is closed. If you need more help, start a new one.</p>}

      {done ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {ticket.rating ? <p className="text-sm text-slate-600">Thanks for rating our help {"★".repeat(ticket.rating)}{"☆".repeat(5 - ticket.rating)}</p> : (
            <>
              <p className="font-semibold">How was our help?</p>
              <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} star${n === 1 ? "" : "s"}`} disabled={busy} onClick={() => void act({ method: "PATCH", body: JSON.stringify({ rating: n, ratingNote: note || undefined }) })} className="text-3xl leading-none text-slate-300 transition hover:scale-110 hover:text-brand">★</button>)}
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Anything we could do better? (optional)" className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
