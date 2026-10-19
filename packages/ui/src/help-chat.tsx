"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_CHAT_STATE_EVENT, LiveChat, type LiveChatProps } from "./live-chat";

type Card =
  | { kind: "order"; title: string; subtitle: string; status: string; tone: "green" | "amber" | "red" | "slate"; href: string }
  | { kind: "product"; title: string; subtitle: string; image?: string | null; href: string };
type Reply = {
  text: string;
  links?: Array<{ label: string; href: string }>;
  quick?: Array<{ label: string; intent: string }>;
  cards?: Card[];
  handoff?: { category: string; subject: string; orderId?: string | null; productId?: string | null };
  signIn?: boolean;
};
type Message = { role: "user" | "assistant"; text: string; reply?: Reply; ticket?: { id: string; number: number } };

export type HelpChatProps = {
  /** Header title, e.g. "LOIMART Help". */
  title: string;
  subtitle?: string;
  /** Base of the support API: /chat, /tickets, /unread live under it. */
  apiBase: string;
  /** Topics a ticket can be filed under. */
  categories: Array<{ key: string; label: string }>;
  /** Where tickets are listed; a ticket opens at `${ticketsPath}/${id}`. */
  ticketsPath: string;
  /** Sign-in page for guests (the current page is added as ?next=). */
  signInHref?: string;
  /** Launcher position, e.g. "bottom-24 lg:bottom-6" above a mobile tab bar. */
  launcherClassName?: string;
  /** Pages where the floating launcher is hidden (the chat can still be opened by event). */
  hideLauncherOn?: string[];
  /** "active": show the floating button only while a live chat is open or replies are unread (the chat is opened from menus). */
  launcher?: "always" | "active";
  storageKey: string;
  /** Live chat with the support team (a separate tool inside the same panel). */
  live?: Omit<LiveChatProps, "onBack">;
};

/** Other buttons can open the chat: window.dispatchEvent(new CustomEvent(HELP_CHAT_OPEN_EVENT)). */
export const HELP_CHAT_OPEN_EVENT = "azadimart:open-help";

const TONE: Record<string, string> = { green: "bg-india-light text-india-dark", amber: "bg-brand-50 text-brand-700", red: "bg-red-50 text-red-700", slate: "bg-slate-100 text-slate-600" };

function ChatIcon({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.6" /></svg>;
}
function CloseIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>;
}
function SendIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

export function HelpChat({ title, subtitle = "Usually answers instantly", apiBase, categories, ticketsPath, signInHref, launcherClassName = "bottom-6", hideLauncherOn = [], launcher = "always", storageKey, live }: HelpChatProps) {
  const [open, setOpen] = useState(false);
  // "bot" = the assistant; "live" = live chat with a person.
  const [mode, setMode] = useState<"bot" | "live">("bot");
  const [liveOpen, setLiveOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(0);
  const [handoff, setHandoff] = useState<null | { category: string; subject: string; message: string; orderId?: string | null; productId?: string | null; error?: string; sending?: boolean }>(null);
  const [path, setPath] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the conversation while the shopper moves between pages (this tab only).
  useEffect(() => {
    setPath(window.location.pathname);
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as { messages: Message[]; chatId: string | null } | null;
      if (saved?.messages?.length) { setMessages(saved.messages.slice(-40)); setChatId(saved.chatId); }
    } catch { /* storage blocked */ }
    try { if (live && localStorage.getItem(live.storageKey)) { setLiveOpen(true); setMode("live"); } } catch { /* storage blocked */ }
    void fetch(`${apiBase}/unread`, { cache: "no-store" }).then((r) => r.json()).then((b: { count?: number }) => setUnread(b.count ?? 0)).catch(() => undefined);
  }, [apiBase, storageKey, live]);
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ messages: messages.slice(-40), chatId })); } catch { /* storage blocked */ }
  }, [messages, chatId, storageKey]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy, handoff]);

  const send = useCallback(async (payload: { message?: string; intent?: string; label?: string }) => {
    const shown = payload.label ?? payload.message ?? "";
    const history = messages.map((m) => ({ role: m.role, content: m.text })).slice(-12);
    if (shown) setMessages((m) => [...m, { role: "user", text: shown }]);
    setBusy(true);
    setHandoff(null);
    try {
      const res = await fetch(`${apiBase}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message: payload.message ?? "", intent: payload.intent ?? "", history, page: window.location.pathname }),
      });
      const body = (await res.json()) as { chatId?: string; reply?: Reply; error?: { message?: string } };
      if (!res.ok || !body.reply) throw new Error(body.error?.message ?? "Something went wrong");
      if (body.chatId) setChatId(body.chatId);
      setMessages((m) => [...m, { role: "assistant", text: body.reply!.text, reply: body.reply }]);
    } catch (error) {
      setMessages((m) => [...m, { role: "assistant", text: error instanceof Error && error.message.includes("Too many") ? error.message : "Sorry, I couldn't answer just now. Please try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  }, [apiBase, chatId, messages]);

  const openChat = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);
  useEffect(() => {
    const onOpen = (e: Event) => { if (live && (e as CustomEvent<{ mode?: string }>).detail?.mode === "live") setMode("live"); openChat(); };
    window.addEventListener(HELP_CHAT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(HELP_CHAT_OPEN_EVENT, onOpen);
  }, [openChat, live]);
  useEffect(() => {
    const onState = (e: Event) => setLiveOpen(Boolean((e as CustomEvent<{ active?: boolean }>).detail?.active));
    window.addEventListener(LIVE_CHAT_STATE_EVENT, onState);
    return () => window.removeEventListener(LIVE_CHAT_STATE_EVENT, onState);
  }, []);
  // Greet on first open.
  useEffect(() => { if (open && mode === "bot" && !messages.length && !busy) void send({ intent: "menu" }); }, [open, mode, messages.length, busy, send]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void send({ message: text });
  }

  function startHandoff(h: Reply["handoff"]) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.text ?? "";
    setHandoff({ category: h?.category && categories.some((c) => c.key === h.category) ? h.category : (categories[0]?.key ?? "OTHER"), subject: h?.subject || "", message: lastUser.length > 8 ? lastUser : "", orderId: h?.orderId ?? null, productId: h?.productId ?? null });
  }

  async function submitTicket() {
    if (!handoff) return;
    const subject = handoff.subject.trim() || handoff.message.trim().slice(0, 70);
    if (handoff.message.trim().length < 2) { setHandoff({ ...handoff, error: "Please describe the problem." }); return; }
    setHandoff({ ...handoff, sending: true, error: undefined });
    try {
      const res = await fetch(`${apiBase}/tickets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: handoff.category, subject: subject.length >= 3 ? subject : "Help request", message: handoff.message.trim(), orderId: handoff.orderId ?? null, productId: handoff.productId ?? null, chatId }),
      });
      const body = (await res.json()) as { ticket?: { id: string; number: number }; error?: { message?: string } };
      if (!res.ok || !body.ticket) throw new Error(body.error?.message ?? "Couldn't send your request");
      setHandoff(null);
      setMessages((m) => [...m, { role: "assistant", text: `Thanks! Your request #${body.ticket!.number} is with our support team. We'll reply in your support inbox, usually within a day.`, ticket: body.ticket }]);
    } catch (error) {
      setHandoff((h) => h && { ...h, sending: false, error: error instanceof Error ? error.message : "Couldn't send your request" });
    }
  }

  const signInLink = signInHref ? `${signInHref}?next=${encodeURIComponent(path || "/")}` : null;
  const last = messages[messages.length - 1];
  const hideLauncher = hideLauncherOn.some((p) => path === p || path.startsWith(p + "/")) || (launcher === "active" && !liveOpen && !unread);

  return (
    <>
      {!open && !hideLauncher ? (
        <button type="button" onClick={openChat} aria-label={unread ? `Open help chat, ${unread} new support repl${unread === 1 ? "y" : "ies"}` : "Open help chat"}
          className={"fixed right-4 z-40 flex items-center gap-2 rounded-full bg-navy py-3 pl-3.5 pr-4 text-white shadow-[0_8px_30px_rgba(11,42,91,0.35)] transition hover:-translate-y-0.5 hover:bg-navy-soft sm:right-6 " + launcherClassName}>
          <ChatIcon size={22} />
          <span className="text-sm font-semibold">{liveOpen ? "Live chat" : "Help"}</span>
          {liveOpen ? <span className="absolute -left-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#22c55e]" aria-hidden /> : null}
          {unread ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold">{unread}</span> : null}
        </button>
      ) : null}

      {open ? (
        <div role="dialog" aria-modal="false" aria-label={title}
          className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,calc(100vh-48px))] sm:w-[400px] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-[0_24px_70px_rgba(15,23,42,0.25)]">
          <header className="relative flex items-center gap-3 bg-navy px-4 py-3.5 text-white">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-brand-300"><ChatIcon size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold leading-tight">{mode === "live" ? "Live chat" : title}</p>
              <p className="flex items-center gap-1.5 text-xs text-white/70"><span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />{mode === "live" ? "Talk to our support team" : subtitle}</p>
            </div>
            {live ? (
              <button type="button" onClick={() => setMode(mode === "live" ? "bot" : "live")} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">
                {mode === "live" ? "Assistant" : "Live agent"}
              </button>
            ) : null}
            <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Close help chat"><CloseIcon /></button>
            <span className="absolute inset-x-0 bottom-0 flex h-[3px]" aria-hidden><span className="flex-1 bg-brand" /><span className="flex-1 bg-white" /><span className="flex-1 bg-india" /></span>
          </header>

          {live && mode === "live" ? <LiveChat {...live} onBack={() => setMode("bot")} /> : <>
          {unread ? (
            <a href={ticketsPath} className="flex items-center justify-between gap-2 border-b border-brand-100 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-800">
              <span>You have {unread} new repl{unread === 1 ? "y" : "ies"} from support</span><span className="font-semibold">View →</span>
            </a>
          ) : null}

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3.5 py-4" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                {m.role === "user" ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy px-3.5 py-2.5 text-sm text-white">{m.text}</p>
                ) : (
                  <div className="max-w-[92%] space-y-2">
                    <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-800 shadow-sm">{m.text}</p>
                    {m.reply?.cards?.length ? (
                      <div className="space-y-1.5">
                        {m.reply.cards.map((c, k) => (
                          <a key={k} href={c.href} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:border-brand-300">
                            {c.kind === "product" ? (
                              c.image ? <img src={c.image} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-slate-100 object-cover" /> : <span className="h-12 w-12 shrink-0 rounded-xl bg-slate-100" />
                            ) : null}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-900">{c.title}</span>
                              <span className="block truncate text-xs text-slate-500">{c.subtitle}</span>
                            </span>
                            {c.kind === "order" ? <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold " + TONE[c.tone]}>{c.status}</span> : null}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {m.reply?.links?.length || m.reply?.signIn || m.ticket ? (
                      <div className="flex flex-wrap gap-1.5">
                        {m.reply?.signIn && signInLink ? <a href={signInLink} className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">Sign in</a> : null}
                        {m.reply?.links?.map((l) => <a key={l.href + l.label} href={l.href} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-slate-900">{l.label} →</a>)}
                        {m.ticket ? <a href={`${ticketsPath}/${m.ticket.id}`} className="rounded-full bg-navy px-3.5 py-1.5 text-xs font-semibold text-white">View request #{m.ticket.number} →</a> : null}
                      </div>
                    ) : null}
                    {m.reply?.handoff && i === messages.length - 1 && !handoff ? (
                      <div className="grid gap-1.5">
                        {live ? <button type="button" onClick={() => setMode("live")} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-navy-soft"><span className="h-2 w-2 rounded-full bg-[#4ade80]" />Chat live with our team</button> : null}
                        <button type="button" onClick={() => startHandoff(m.reply!.handoff)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-navy/20 bg-white px-3 py-2.5 text-sm font-semibold text-navy shadow-sm hover:bg-navy hover:text-white">
                          {live ? "Leave a message instead" : "Talk to a person"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {busy ? (
              <div className="flex justify-start" aria-label="Assistant is typing">
                <span className="flex gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                  {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 120}ms` }} />)}
                </span>
              </div>
            ) : null}

            {handoff ? (
              <form onSubmit={(e) => { e.preventDefault(); void submitTicket(); }} className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <p className="text-sm font-semibold">Send to our support team</p>
                <label className="block text-xs font-medium text-slate-600">Topic
                  <select value={handoff.category} onChange={(e) => setHandoff({ ...handoff, category: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                    {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">Subject
                  <input value={handoff.subject} maxLength={120} onChange={(e) => setHandoff({ ...handoff, subject: e.target.value })} placeholder="In a few words" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                </label>
                <label className="block text-xs font-medium text-slate-600">What happened?
                  <textarea value={handoff.message} maxLength={4000} rows={4} onChange={(e) => setHandoff({ ...handoff, message: e.target.value })} placeholder="Include the order number, dates and anything that helps." className="mt-1 w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                </label>
                {handoff.error ? <p className="text-xs font-medium text-red-600">{handoff.error}</p> : null}
                <p className="text-[11px] text-slate-500">Your chat above is shared with the team so you don&apos;t have to repeat yourself.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setHandoff(null)} className="flex-1 rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold">Cancel</button>
                  <button type="submit" disabled={handoff.sending} className="flex-1 rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{handoff.sending ? "Sending…" : "Send"}</button>
                </div>
              </form>
            ) : null}
          </div>

          {last?.reply?.quick?.length && !busy && !handoff ? (
            <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 bg-white px-3 pb-1 pt-2.5 [scrollbar-width:none]">
              {last.reply.quick.map((q) => (
                <button key={q.intent + q.label} type="button" onClick={() => void send({ intent: q.intent, label: q.label })}
                  className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:border-brand-500">{q.label}</button>
              ))}
            </div>
          ) : null}

          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 border-t border-slate-100 bg-white p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <label className="sr-only" htmlFor="help-chat-input">Type your question</label>
            <textarea id="help-chat-input" ref={inputRef} value={input} rows={1} maxLength={1000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Type your question…" className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-navy" />
            <button type="submit" disabled={!input.trim() || busy} aria-label="Send" className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-brand text-white hover:bg-brand-600 disabled:bg-slate-300"><SendIcon /></button>
          </form>
          </>}
        </div>
      ) : null}
    </>
  );
}

/** A button anywhere on the page that opens the help chat. */
export function OpenHelpChatButton({ className, children, mode }: { className?: string; children: React.ReactNode; mode?: "live" }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent(HELP_CHAT_OPEN_EVENT, { detail: { mode } }))}>{children}</button>;
}
