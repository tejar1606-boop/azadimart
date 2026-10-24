"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatAttachmentView, ChatFileButton, type ChatAttachment } from "./chat-attachment";

type Msg = { seq: number; author: "REQUESTER" | "AGENT" | "SYSTEM"; body: string; attachment?: ChatAttachment | null; createdAt: string; agentName: string | null };
type ChatState = {
  id: string; status: "WAITING" | "ACTIVE" | "ENDED"; agentName: string | null; agentTyping: boolean; agentReadSeq: number;
  position: number | null; waitSeconds: number | null; waited: number; offerMessage: boolean; endReason: string | null; rating: number | null; ticketId: string | null;
};
type Availability = { online: number; waitSeconds: number | null; openChatId: string | null; signedIn: boolean };

/** Fired when a live chat starts or ends (the launcher shows "Live chat" meanwhile). */
export const LIVE_CHAT_STATE_EVENT = "azadimart:live-chat-state";

export type LiveChatProps = {
  apiBase: string;
  topics: Array<{ key: string; label: string }>;
  /** Where support requests are listed (for "we saved this as request #…"). */
  ticketsPath?: string;
  storageKey: string;
  /** Back to the assistant. */
  onBack?: () => void;
};

const waitText = (s: number | null) => (s === null ? "Our team is offline right now" : s < 60 ? "Usually under a minute" : `About ${Math.round(s / 60)} min`);
const time = (d: string) => new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** A short two-note chime for new agent messages (only when the page is in the background). */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12); g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.25); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.12); o.stop(ctx.currentTime + i * 0.12 + 0.3); });
  } catch { /* sound not available */ }
}

/**
 * Live chat with the support team: start form (with who's online and the
 * expected wait), queue position while waiting, agent name and typing while
 * chatting, photos and PDFs (📎) for faster help, "leave a message instead" when it takes too long, and a rating.
 */
export function LiveChat({ apiBase, topics, ticketsPath, storageKey, onBack }: LiveChatProps) {
  const [avail, setAvail] = useState<Availability | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatState | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [form, setForm] = useState({ topic: topics[0]?.key ?? "OTHER", message: "", name: "", contact: "" });
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leave, setLeave] = useState<null | { message: string; contact: string }>(null);
  const [ticket, setTicket] = useState<{ id: string; number: number } | null>(null);
  const [rated, setRated] = useState(false);
  const lastSeq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const typingSent = useRef(0);

  const headers = useCallback((): HeadersInit => ({ "Content-Type": "application/json", ...(key ? { "x-live-chat-key": key } : {}) }), [key]);
  const save = (id: string | null, k: string | null) => {
    try { if (id) localStorage.setItem(storageKey, JSON.stringify({ id, key: k })); else localStorage.removeItem(storageKey); } catch { /* storage blocked */ }
    window.dispatchEvent(new CustomEvent(LIVE_CHAT_STATE_EVENT, { detail: { active: Boolean(id) } }));
  };

  // Resume an open chat (this browser, or the signed-in account's), else show who's online.
  useEffect(() => {
    let saved: { id: string; key: string | null } | null = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey) ?? "null"); } catch { /* storage blocked */ }
    fetch(apiBase, { cache: "no-store" }).then((r) => r.json()).then((a: Availability) => {
      setAvail(a);
      const id = a.openChatId ?? saved?.id ?? null;
      if (id) { setKey(saved?.id === id ? saved.key : null); setChatId(id); }
    }).catch(() => setAvail({ online: 0, waitSeconds: null, openChatId: null, signedIn: false }));
  }, [apiBase, storageKey]);

  const apply = useCallback((data: { chat: ChatState; messages: Msg[]; lastSeq: number }) => {
    setChat(data.chat);
    if (data.messages.length) {
      setMessages((m) => { const seen = new Set(m.map((x) => x.seq)); return [...m, ...data.messages.filter((x) => !seen.has(x.seq))]; });
      if (document.hidden && data.messages.some((m) => m.author === "AGENT")) chime();
    }
    lastSeq.current = Math.max(lastSeq.current, data.lastSeq);
  }, []);

  // Poll for new messages: every 2 s while open (slower in a background tab), stop when ended.
  useEffect(() => {
    if (!chatId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`${apiBase}/${chatId}?after=${lastSeq.current}`, { cache: "no-store", headers: headers() });
        if (r.status === 404 || r.status === 401) { save(null, null); setChatId(null); setChat(null); setMessages([]); lastSeq.current = 0; return; }
        const data = await r.json();
        if (r.ok && !stop) apply(data);
        if (data?.chat?.status === "ENDED") { save(null, null); return; }
      } catch { /* network blip: try again */ }
      if (!stop) timer = setTimeout(tick, document.hidden ? 6000 : 2000);
    };
    void tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [chatId, apiBase, headers, apply]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length, chat?.agentTyping, chat?.status, leave]);

  async function post(path: string, body?: unknown) {
    const r = await fetch(`${apiBase}${path}`, { method: "POST", headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(data?.error?.message ?? "Something went wrong");
    return data;
  }

  async function start() {
    setBusy(true); setError("");
    try {
      const signedIn = avail?.signedIn;
      const data = await post("", { topic: form.topic, message: form.message, ...(signedIn ? {} : { name: form.name, contact: form.contact || undefined }), page: window.location.pathname });
      lastSeq.current = 0; setMessages([]); setTicket(null); setRated(false);
      setKey(data.token ?? key); setChatId(data.chatId); save(data.chatId, data.token ?? key);
      setForm((f) => ({ ...f, message: "" }));
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't start the chat"); } finally { setBusy(false); }
  }

  /** Nobody online: start the chat and leave the message in one go. */
  async function offline() {
    setBusy(true); setError("");
    try {
      const signedIn = avail?.signedIn;
      if (!signedIn && !form.contact.trim()) throw new Error("Add a phone number or email so we can reply");
      const data = await post("", { topic: form.topic, message: form.message, ...(signedIn ? {} : { name: form.name, contact: form.contact }), page: window.location.pathname });
      const k = data.token ?? key;
      const r = await fetch(`${apiBase}/${data.chatId}/leave-message`, { method: "POST", headers: { "Content-Type": "application/json", ...(k ? { "x-live-chat-key": k } : {}) }, body: JSON.stringify({ message: form.message, contact: form.contact || undefined }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message ?? "Couldn't send your message");
      lastSeq.current = 0; setMessages([]); setTicket(body.ticket); setKey(k); setChatId(data.chatId);
      setForm((f) => ({ ...f, message: "" }));
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't send your message"); } finally { setBusy(false); }
  }

  async function send() {
    const body = text.trim();
    if (!body || !chatId) return;
    setText("");
    // Show it straight away; the next check brings the saved copy.
    const temp: Msg = { seq: -Date.now(), author: "REQUESTER", body, createdAt: new Date().toISOString(), agentName: null };
    setMessages((m) => [...m, temp]);
    try { apply(await post(`/${chatId}/messages?after=${lastSeq.current}`, { body })); setMessages((m) => m.filter((x) => x.seq !== temp.seq)); }
    catch (e) { setMessages((m) => m.filter((x) => x.seq !== temp.seq)); setText(body); setError(e instanceof Error ? e.message : "Message not sent"); }
  }

  /** Sends a photo or PDF, with whatever is typed as its caption. */
  async function sendFile(file: File) {
    if (!chatId) return;
    const caption = text.trim();
    setText(""); setError("");
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
    const temp: Msg = { seq: -Date.now(), author: "REQUESTER", body: caption, createdAt: new Date().toISOString(), agentName: null,
      attachment: { url: preview, name: file.name, mimeType: file.type, size: file.size, kind: file.type === "application/pdf" ? "DOCUMENT" : "IMAGE" } };
    setMessages((m) => [...m, temp]);
    try {
      const form = new FormData();
      form.append("file", file);
      if (caption) form.append("caption", caption);
      const r = await fetch(`${apiBase}/${chatId}/attachments?after=${lastSeq.current}`, { method: "POST", headers: key ? { "x-live-chat-key": key } : {}, body: form });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error?.message ?? "File not sent");
      apply(data);
      setMessages((m) => m.filter((x) => x.seq !== temp.seq));
    } catch (e) {
      setMessages((m) => m.filter((x) => x.seq !== temp.seq));
      setText(caption);
      setError(e instanceof Error ? e.message : "File not sent");
    } finally {
      if (preview) URL.revokeObjectURL(preview);
    }
  }

  function typing() {
    if (!chatId || Date.now() - typingSent.current < 3000) return;
    typingSent.current = Date.now();
    void post(`/${chatId}/typing`).catch(() => undefined);
  }

  async function leaveMessage() {
    if (!leave || !chatId) return;
    setBusy(true); setError("");
    try {
      const data = await post(`/${chatId}/leave-message`, { message: leave.message || messages.find((m) => m.author === "REQUESTER")?.body || "Please get back to me", contact: leave.contact || undefined });
      setTicket(data.ticket); setLeave(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't send your message"); } finally { setBusy(false); }
  }

  const newChat = () => { save(null, null); setChatId(null); setChat(null); setMessages([]); lastSeq.current = 0; setTicket(null); setRated(false); void fetch(apiBase, { cache: "no-store" }).then((r) => r.json()).then(setAvail).catch(() => undefined); };
  const online = (avail?.online ?? 0) > 0;
  const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-navy";

  // ----- start form -----
  if (!chatId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
          {onBack ? <button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-slate-500 hover:text-slate-900">← Back to the assistant</button> : null}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">{online ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-60" /> : null}<span className={"relative inline-flex h-3 w-3 rounded-full " + (online ? "bg-[#22c55e]" : "bg-slate-300")} /></span>
              <div>
                <p className="text-sm font-semibold">{avail === null ? "Checking who's online…" : online ? `${avail.online} support agent${avail.online === 1 ? "" : "s"} online` : "Our team is offline right now"}</p>
                <p className="text-xs text-slate-500">{avail === null ? "" : online ? `Expected wait: ${waitText(avail.waitSeconds).toLowerCase()}` : "Leave a message and we'll reply as soon as we're back."}</p>
              </div>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void (online ? start() : offline()); }} className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {avail && !avail.signedIn ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-slate-600">Your name<input required minLength={2} maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} /></label>
                <label className="text-xs font-medium text-slate-600">Phone or email<input maxLength={120} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder={online ? "Optional" : "So we can reply"} required={!online} className={field} /></label>
              </div>
            ) : null}
            <label className="block text-xs font-medium text-slate-600">Topic
              <select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className={field}>{topics.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
            </label>
            <label className="block text-xs font-medium text-slate-600">How can we help?
              <textarea required maxLength={2000} rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Include your order number if it's about an order" className={field + " resize-none"} />
            </label>
            {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
            <button type="submit" disabled={busy || !avail || form.message.trim().length < 2} className="w-full rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Connecting…" : online ? "Start live chat" : "Leave a message"}</button>
          </form>
        </div>
      </div>
    );
  }

  // ----- chat -----
  const status = chat?.status ?? "WAITING";
  const lastMine = [...messages].reverse().find((m) => m.author === "REQUESTER" && m.seq > 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-2.5">
        <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold uppercase " + (status === "ACTIVE" ? "bg-navy text-white" : "bg-slate-100 text-slate-500")}>{chat?.agentName ? chat.agentName.slice(0, 2) : "…"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{status === "ACTIVE" ? chat?.agentName : status === "ENDED" ? "Chat ended" : "Connecting you to an agent…"}</p>
          <p className="truncate text-xs text-slate-500">{status === "ACTIVE" ? (chat?.agentTyping ? "typing…" : "LOIMART support · online") : status === "WAITING" ? (chat?.position ? `You're #${chat.position} in line · ${waitText(chat.waitSeconds).toLowerCase()}` : "One moment…") : "Thanks for chatting with us"}</p>
        </div>
        {status !== "ENDED" ? <button type="button" onClick={() => { if (confirm("End this chat?")) void post(`/${chatId}/end`).then(() => setChat((c) => c && { ...c, status: "ENDED" })).catch(() => undefined); }} className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50">End</button> : null}
      </div>

      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto bg-slate-50 px-3.5 py-4" aria-live="polite">
        {status === "WAITING" ? (
          <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <p className="font-semibold">{chat?.position ? `You're number ${chat.position} in line` : "Finding an agent for you"}</p>
            <p className="mt-0.5 text-xs">Expected wait: {waitText(chat?.waitSeconds ?? null).toLowerCase()}. Please keep this window open.</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-brand-100"><div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-brand" /></div>
          </div>
        ) : null}
        {messages.map((m) => m.author === "SYSTEM" ? (
          <p key={m.seq} className="text-center text-[11px] text-slate-500">{m.body}</p>
        ) : (
          <div key={m.seq} className={"flex " + (m.author === "REQUESTER" ? "justify-end" : "justify-start")}>
            <div className={"max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-6 " + (m.author === "REQUESTER" ? "rounded-br-md bg-navy text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800 shadow-sm")}>
              {m.author === "AGENT" ? <p className="text-[11px] font-semibold text-brand-700">{m.agentName}</p> : null}
              {m.attachment ? <div className="my-1">{m.attachment.url ? <ChatAttachmentView file={m.attachment} mine={m.author === "REQUESTER"} /> : <p className="text-xs opacity-80">📄 {m.attachment.name}</p>}</div> : null}
              {m.body ? <p className="whitespace-pre-wrap">{m.body}</p> : null}
              <p className={"mt-0.5 text-right text-[10px] " + (m.author === "REQUESTER" ? "text-white/60" : "text-slate-400")}>{m.seq < 0 ? "Sending…" : time(m.createdAt)}{m.author === "REQUESTER" && m.seq > 0 && m.seq === lastMine?.seq && (chat?.agentReadSeq ?? 0) >= m.seq ? " · Seen" : ""}</p>
            </div>
          </div>
        ))}
        {chat?.agentTyping ? <div className="flex justify-start"><span className="flex gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 120}ms` }} />)}</span></div> : null}

        {status === "WAITING" && chat?.offerMessage && !leave && !ticket ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-sm shadow-sm">
            <p className="font-semibold">{chat.waitSeconds === null ? "No agent is online right now" : "Sorry for the wait"}</p>
            <p className="mt-0.5 text-xs text-slate-500">Leave a message instead and our team will get back to you. You won&apos;t lose your place if you keep waiting.</p>
            <button type="button" onClick={() => setLeave({ message: "", contact: "" })} className="mt-2.5 w-full rounded-full border border-navy/30 px-3 py-2 text-sm font-semibold text-navy hover:bg-navy hover:text-white">Leave a message</button>
          </div>
        ) : null}
        {leave ? (
          <form onSubmit={(e) => { e.preventDefault(); void leaveMessage(); }} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <p className="text-sm font-semibold">Leave a message</p>
            <textarea value={leave.message} maxLength={2000} rows={3} onChange={(e) => setLeave({ ...leave, message: e.target.value })} placeholder="Anything to add? (your chat is included)" className={field + " resize-none"} />
            {avail && !avail.signedIn ? <input value={leave.contact} onChange={(e) => setLeave({ ...leave, contact: e.target.value })} maxLength={120} placeholder="Phone or email so we can reply" className={field} /> : null}
            <div className="flex gap-2"><button type="button" onClick={() => setLeave(null)} className="flex-1 rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold">Keep waiting</button><button type="submit" disabled={busy} className="flex-1 rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Send</button></div>
          </form>
        ) : null}
        {ticket ? <div className="rounded-2xl bg-india-light px-4 py-3 text-sm text-india-dark">Saved as support request <b>#{ticket.number}</b>.{ticketsPath && avail?.signedIn ? <> <a href={`${ticketsPath}/${ticket.id}`} className="font-semibold underline">View it</a></> : null}</div> : null}

        {status === "ENDED" ? (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            {chat?.endReason !== "TICKET" && !chat?.rating && !rated ? (
              <>
                <p className="text-sm font-semibold">How was your chat?</p>
                <div className="flex justify-center gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => void post(`/${chatId}/rate`, { rating: n }).then(() => setRated(true)).catch(() => undefined)} className="text-3xl leading-none text-slate-300 transition hover:scale-110 hover:text-brand">★</button>)}</div>
              </>
            ) : rated ? <p className="text-sm text-slate-600">Thanks for your feedback!</p> : null}
            <button type="button" onClick={newChat} className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Start a new chat</button>
          </div>
        ) : null}
      </div>

      {status !== "ENDED" && !ticket ? (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2 border-t border-slate-100 bg-white p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <ChatFileButton onFile={(f) => void sendFile(f)} onError={setError} />
          <label className="sr-only" htmlFor="live-chat-input">Message</label>
          <textarea id="live-chat-input" value={text} rows={1} maxLength={2000} onChange={(e) => { setText(e.target.value); typing(); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={status === "WAITING" ? "Add more details while you wait…" : "Type a message…"} className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-navy" />
          <button type="submit" disabled={!text.trim()} aria-label="Send" className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-brand text-white hover:bg-brand-600 disabled:bg-slate-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </button>
        </form>
      ) : null}
      {error && chatId ? <p className="bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
