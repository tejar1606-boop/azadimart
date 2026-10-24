"use client";

import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_KEYS, SUPPORT_PRIORITIES, SUPPORT_STATUSES, SUPPORT_STATUS_STAFF_LABELS, isSupportOverdue, supportCategoryLabel } from "@azadimart/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Message = { id: string; authorType: "REQUESTER" | "STAFF" | "BOT" | "SYSTEM"; isInternal: boolean; message: string; createdAt: string; author: string | null };
type Ticket = {
  id: string; number: number; requesterType: "CUSTOMER" | "SELLER"; category: string; priority: string; status: (typeof SUPPORT_STATUSES)[number];
  channel: string; subject: string; assignedToUserId: string | null; lastMessageAt: string; lastReplyBy: string; createdAt: string; firstResponseAt: string | null;
  resolvedAt: string | null; rating: number | null; ratingNote: string | null;
};
type Order = { id: string; number: string; status: string; total: number; createdAt: string; deliveredAt: string | null; cancellationReason: string | null; payment: string | null; paymentStatus: string | null; items: Array<{ title: string; quantity: number; unitPricePaise: number; storeName: string | null }> };
type Context =
  | { kind: "CUSTOMER"; email: string | null; phone: string | null; since: string | null; name: string | null; recentOrders: Array<{ id: string; number: string; status: string; total: number; createdAt: string }>; orderCount: number; ticketCount: number }
  | { kind: "SELLER"; email: string | null; phone: string | null; since: string | null; seller?: { storeName: string; legalName: string; status: string; gstin: string | null; taxType: string; state: string | null; approvedAt: string | null; holdReason: string | null }; aadhaarVerified: boolean; bank: { status: string; last4: string; ifsc: string } | null; liveProducts: number; ticketCount: number }
  | { kind: "UNKNOWN"; email: string | null };
type Data = { ticket: Ticket; messages: Message[]; context: Context; order: Order | null; product: { id: string; title: string; slug: string; status: string } | null; team: Array<{ userId: string; name: string }>; canned: Array<{ id: string; title: string; body: string }>; chatEngine: string | null };

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN");
const stamp = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const words = (v: string) => v.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3 py-1.5 text-sm"><dt className="text-slate-500">{label}</dt><dd className="min-w-0 text-right font-medium text-slate-900">{children}</dd></div>;
}

export default function TicketWorkspace({ ticketId }: { ticketId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);

  const call = useCallback(async (init?: RequestInit) => {
    const r = await fetch(`/api/v1/support/tickets/${ticketId}`, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } });
    const body = await r.json();
    if (!r.ok) throw new Error(body?.error?.message ?? "Something went wrong");
    setData(body);
    setError("");
  }, [ticketId]);
  useEffect(() => { call().catch((e: Error) => setError(e.message)); }, [call]);

  async function act(init: RequestInit) {
    setBusy(true);
    try { await call(init); return true; } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); return false; } finally { setBusy(false); }
  }
  const update = (patch: Record<string, unknown>) => act({ method: "PATCH", body: JSON.stringify(patch) });

  async function send(resolve: boolean) {
    if (!text.trim()) return;
    if (await act({ method: "POST", body: JSON.stringify({ message: text, internal }) })) {
      setText("");
      if (resolve && !internal) await update({ status: "RESOLVED" });
    }
  }

  if (!data) return <main className="px-4 py-10 sm:px-6 lg:px-10"><p className="text-sm text-slate-500">{error || "Loading…"}</p></main>;
  const { ticket, messages, context, order, product, team, canned } = data;
  const overdue = isSupportOverdue(ticket);
  const firstName = context.kind === "CUSTOMER" ? (context.name ?? "").split(" ")[0] : context.kind === "SELLER" ? context.seller?.storeName ?? "" : "";

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link href="/support" className="text-sm font-semibold text-slate-500 hover:text-slate-950">← Support desk</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            #{ticket.number} · {ticket.requesterType === "SELLER" ? "Seller" : "Customer"} · {supportCategoryLabel(ticket.category)} · via {ticket.channel === "CHAT" ? `help chat${data.chatEngine === "AI" ? " (AI)" : ""}` : "form"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-slate-500">Opened {stamp(ticket.createdAt)}{ticket.firstResponseAt ? ` · first reply ${stamp(ticket.firstResponseAt)}` : ""}</p>
        </div>
        {overdue ? <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">Overdue</span> : null}
      </div>
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-4">
          <ol className="space-y-3" aria-label="Conversation">
            {messages.map((m) => {
              if (m.authorType === "SYSTEM" && !m.isInternal) return <li key={m.id} className="text-center text-xs text-slate-500">{m.message} · {stamp(m.createdAt)}</li>;
              const mine = m.authorType === "STAFF";
              const note = m.isInternal;
              return (
                <li key={m.id} className={"flex " + (mine && !note ? "justify-end" : "justify-start")}>
                  <div className={"max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[80%] " + (note ? "border border-amber-200 bg-amber-50" : mine ? "rounded-br-md bg-navy text-white" : "rounded-bl-md border border-slate-200 bg-white shadow-sm")}>
                    <p className={"mb-1 text-xs font-semibold " + (note ? "text-amber-800" : mine ? "text-white/70" : "text-slate-500")}>
                      {note ? (m.authorType === "SYSTEM" ? "Context · staff only" : `Internal note · ${m.author}`) : mine ? m.author : firstName || "Requester"} · {stamp(m.createdAt)}
                    </p>
                    {note && m.authorType === "SYSTEM" ? (
                      <details><summary className="cursor-pointer text-amber-900">{m.message.split("\n")[0]}</summary><p className="mt-2 whitespace-pre-wrap text-amber-950">{m.message.split("\n").slice(1).join("\n").trim()}</p></details>
                    ) : <p className="whitespace-pre-wrap">{m.message}</p>}
                  </div>
                </li>
              );
            })}
          </ol>

          <form onSubmit={(e) => { e.preventDefault(); void send(false); }} className={"rounded-2xl border bg-white p-4 shadow-card " + (internal ? "border-amber-300" : "border-slate-200")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm font-semibold" role="tablist" aria-label="Message type">
                <button type="button" role="tab" aria-selected={!internal} onClick={() => setInternal(false)} className={"rounded-full px-3.5 py-1.5 " + (!internal ? "bg-white shadow-sm" : "text-slate-500")}>Reply to {ticket.requesterType === "SELLER" ? "seller" : "customer"}</button>
                <button type="button" role="tab" aria-selected={internal} onClick={() => setInternal(true)} className={"rounded-full px-3.5 py-1.5 " + (internal ? "bg-amber-100 text-amber-900 shadow-sm" : "text-slate-500")}>Internal note</button>
              </div>
              {canned.length ? (
                <select value="" onChange={(e) => { const c = canned.find((x) => x.id === e.target.value); if (c) setText((t) => (t ? t + "\n\n" : "") + c.body.replace(/\{name\}/g, firstName || "there")); }} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm" aria-label="Insert a saved reply">
                  <option value="">Insert saved reply…</option>
                  {canned.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              ) : <Link href="/support/replies" className="text-xs font-semibold text-slate-500 hover:text-slate-900">+ Saved replies</Link>}
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={4000} placeholder={internal ? "Only the support team sees this." : `Write to ${firstName || "the requester"}…`} className={"mt-3 w-full rounded-xl border px-3 py-2.5 text-sm " + (internal ? "border-amber-200 bg-amber-50/40" : "border-slate-300")} />
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {!internal ? <button type="button" disabled={busy || !text.trim()} onClick={() => void send(true)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:border-india hover:text-india-dark disabled:opacity-50">Send &amp; resolve</button> : null}
              <button type="submit" disabled={busy || !text.trim()} className={"rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 " + (internal ? "bg-amber-600 hover:bg-amber-700" : "bg-brand hover:bg-brand-600")}>{busy ? "Saving…" : internal ? "Add note" : "Send reply"}</button>
            </div>
            {!internal && ticket.requesterType === "SELLER" ? <p className="mt-2 text-right text-[11px] text-slate-500">The seller gets an alert in Seller Hub.</p> : null}
          </form>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
            <h2 className="font-semibold">Ticket</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-500">Status
                <select disabled={busy} value={ticket.status} onChange={(e) => void update({ status: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900">
                  {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{SUPPORT_STATUS_STAFF_LABELS[s]}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500">Priority
                <select disabled={busy} value={ticket.priority} onChange={(e) => void update({ priority: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900">
                  {SUPPORT_PRIORITIES.map((p) => <option key={p} value={p}>{words(p)}</option>)}
                </select>
              </label>
              <label className="col-span-2 text-xs font-medium text-slate-500">Assigned to
                <select disabled={busy} value={ticket.assignedToUserId ?? ""} onChange={(e) => void update({ assignedToUserId: e.target.value || null })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900">
                  <option value="">Unassigned</option>
                  {team.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </select>
              </label>
              <label className="col-span-2 text-xs font-medium text-slate-500">Topic
                <select disabled={busy} value={ticket.category} onChange={(e) => void update({ category: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900">
                  {SUPPORT_CATEGORY_KEYS.filter((k) => SUPPORT_CATEGORIES[k].for === ticket.requesterType || SUPPORT_CATEGORIES[k].for === "ANY").map((k) => <option key={k} value={k}>{SUPPORT_CATEGORIES[k].label}</option>)}
                </select>
              </label>
            </div>
            {ticket.rating ? <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">Rated {"★".repeat(ticket.rating)}{"☆".repeat(5 - ticket.rating)}{ticket.ratingNote ? ` · “${ticket.ratingNote}”` : ""}</p> : null}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
            <h2 className="font-semibold">{context.kind === "SELLER" ? "Seller" : "Customer"}</h2>
            <dl className="mt-2 divide-y divide-slate-100">
              {context.kind === "SELLER" ? (
                <>
                  <Row label="Store">{context.seller?.storeName}</Row>
                  <Row label="Legal name">{context.seller?.legalName}</Row>
                  <Row label="Status">{words(context.seller?.status ?? "")}</Row>
                  <Row label="Tax ID">{context.seller?.gstin ?? (context.seller?.taxType === "ENROLMENT_ID" ? "GST Enrolment ID" : "–")}</Row>
                  <Row label="Aadhaar">{context.aadhaarVerified ? "Verified" : "Not verified"}</Row>
                  <Row label="Bank">{context.bank ? `•••• ${context.bank.last4} · ${words(context.bank.status)}` : "Not added"}</Row>
                  {context.seller?.holdReason ? <Row label="Payout hold"><span className="text-red-700">{context.seller.holdReason}</span></Row> : null}
                  <Row label="Live products">{context.liveProducts}</Row>
                </>
              ) : context.kind === "CUSTOMER" ? (
                <>
                  <Row label="Name">{context.name}</Row>
                  <Row label="Orders">{context.orderCount}</Row>
                </>
              ) : null}
              <Row label="Email">{context.email ? <a className="text-brand-700 hover:underline" href={`mailto:${context.email}`}>{context.email}</a> : "–"}</Row>
              {"phone" in context && context.phone ? <Row label="Phone">{context.phone} <a href={`/calls?dial=${encodeURIComponent(context.phone)}&ticket=${ticketId}`} className="ml-1 font-bold text-brand-700 hover:underline">📞 Call</a></Row> : null}
              {"since" in context && context.since ? <Row label="Member since">{day(context.since)}</Row> : null}
              {"ticketCount" in context ? <Row label="Requests">{context.ticketCount}</Row> : null}
            </dl>
            {context.kind === "SELLER" ? <Link href="/sellers" className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline">Open Sellers &amp; KYC →</Link> : null}
          </div>

          {order ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
              <h2 className="font-semibold">Order {order.number}</h2>
              <dl className="mt-2 divide-y divide-slate-100">
                <Row label="Status">{words(order.status)}</Row>
                <Row label="Total">{money(order.total)}</Row>
                <Row label="Payment">{order.payment === "COD" ? "Cash on Delivery" : "Online"}{order.paymentStatus ? ` · ${words(order.paymentStatus)}` : ""}</Row>
                <Row label="Placed">{day(order.createdAt)}</Row>
                {order.deliveredAt ? <Row label="Delivered">{day(order.deliveredAt)}</Row> : null}
                {order.cancellationReason ? <Row label="Cancelled">{order.cancellationReason}</Row> : null}
              </dl>
              <ul className="mt-2 space-y-1 text-sm">
                {order.items.map((i, k) => <li key={k} className="flex justify-between gap-2"><span className="truncate">{i.title} × {i.quantity}<span className="block text-xs text-slate-500">{i.storeName}</span></span><span className="shrink-0">{money(i.unitPricePaise * i.quantity)}</span></li>)}
              </ul>
              <Link href={`/orders?q=${encodeURIComponent(order.number)}`} className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline">Open in Orders →</Link>
            </div>
          ) : null}

          {product ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
              <h2 className="font-semibold">Product</h2>
              <p className="mt-2 text-sm">{product.title}</p>
              <p className="text-xs text-slate-500">{words(product.status)}</p>
            </div>
          ) : null}

          {context.kind === "CUSTOMER" && context.recentOrders.length ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
              <h2 className="font-semibold">Recent orders</h2>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {context.recentOrders.map((o) => <li key={o.id} className="flex justify-between gap-2 py-1.5"><span className="truncate">{o.number}<span className="block text-xs text-slate-500">{day(o.createdAt)} · {words(o.status)}</span></span><span className="shrink-0">{money(o.total)}</span></li>)}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
