"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { deviceSignals } from "../../lib/device";

type Summary = {
  balancePaise: number;
  nextExpiry: { amount: number; at: string } | null;
  entries: Array<{ id: string; kind: string; amountPaise: number; remainingPaise: number; expiresAt: string | null; orderId: string | null; note: string | null; createdAt: string }>;
  rules: { enabled: boolean; bonusPaise: number; maxPerOrderPaise: number; minOrderPaise: number; expiryDays: number };
  bonus: { state: "CLAIMED" | "NOT_ELIGIBLE" | "OFF" | "READY" | "VERIFY_PHONE"; reason?: string | null };
  phone: string | null;
  phoneVerified: boolean;
};
const rs = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const KIND: Record<string, string> = { SIGNUP_BONUS: "Welcome bonus", ORDER_SPEND: "Used on an order", ORDER_REFUND: "Order cancelled: money back", ADJUSTMENT: "Adjustment by LOIMART" };

async function api(path: string, body?: unknown) {
  const r = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const b = await r.json().catch(() => null);
  if (r.status === 401) { window.location.replace("/login?next=/account/wallet"); throw new Error("Please sign in"); }
  if (!r.ok) throw new Error(b?.error?.details?.[0]?.message ?? b?.error?.message ?? "Something went wrong");
  return b;
}

/** The shopper's LOIMART wallet: welcome bonus (verify mobile → claim), balance, expiry and history. */
export default function WalletPage() {
  const [w, setW] = useState<Summary | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ phone: string; devCode?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);

  const load = useCallback(async () => { try { setW(await api("/api/v1/wallet")); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't load your wallet" }); } }, []);
  useEffect(() => { void load(); }, [load]);

  const claim = useCallback(async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api("/api/v1/wallet/claim", await deviceSignals());
      setMsg(r.granted ? { ok: true, text: `🎉 ${rs(r.amountPaise)} added to your wallet! Use it by ${day(r.expiresAt)}.` } : r.alreadyClaimed ? { ok: true, text: "You already have your welcome bonus." } : { ok: false, text: r.reason ?? "Sorry, this account can't get the welcome bonus." });
      await load();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't add the bonus" }); } finally { setBusy(false); }
  }, [load]);
  // Verified already: add the bonus straight away.
  useEffect(() => { if (w?.bonus.state === "READY" && !tried.current) { tried.current = true; void claim(); } }, [w, claim]);

  async function sendCode() {
    setBusy(true); setMsg(null);
    try { setSent(await api("/api/v1/wallet/verify-phone", {})); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't send the code" }); } finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setMsg(null);
    try { await api("/api/v1/wallet/verify-phone", { code }); tried.current = true; await claim(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't verify" }); setBusy(false); }
  }

  if (!w) return <main className="min-h-[60vh] bg-white px-4 py-12">{msg ? <p className="mx-auto max-w-md text-center text-sm text-red-700">{msg.text}</p> : <div className="mx-auto h-64 max-w-3xl animate-pulse bg-slate-100" />}</main>;
  const r = w.rules;
  return (
    <main className="min-h-[60vh] bg-white px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/account" className="text-sm font-semibold text-slate-500">← My account</Link>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em] sm:text-4xl">My wallet</h1>

        <section className="mt-6 bg-gradient-to-br from-[#2A0E5F] to-[#6A2CD6] p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">LOIMART wallet balance</p>
          <p className="mt-2 text-5xl font-black">{rs(w.balancePaise)}</p>
          {w.nextExpiry ? <p className="mt-2 text-sm text-white/80">{rs(w.nextExpiry.amount)} expires on <b>{day(w.nextExpiry.at)}</b></p> : null}
          <p className="mt-4 text-xs text-white/70">Use up to {rs(r.maxPerOrderPaise)} on any order of {rs(r.minOrderPaise)} or more: tick &ldquo;Use wallet&rdquo; at checkout.</p>
          {w.balancePaise > 0 ? <Link href="/products" className="mt-5 inline-flex rounded-full bg-[#F9CB5B] px-5 py-2.5 text-sm font-bold text-[#2A0E5F]">Shop now</Link> : null}
        </section>

        {w.bonus.state === "VERIFY_PHONE" ? (
          <section className="mt-5 border-2 border-[#F9CB5B] bg-amber-50/60 p-5 sm:p-6">
            <p className="text-lg font-bold">🎁 Get {rs(r.bonusPaise)} welcome bonus</p>
            <p className="mt-1 text-sm text-slate-600">Verify your mobile {w.phone ? <b>{w.phone}</b> : null} with a one-time code. One bonus per mobile number and device; use it within {r.expiryDays} days.</p>
            {!sent ? <button type="button" disabled={busy} onClick={() => void sendCode()} className="mt-4 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy ? "Sending…" : "Send code"}</button> : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" className="w-40 border border-slate-300 px-3 py-2.5 text-center font-mono text-lg tracking-widest" />
                <button type="button" disabled={busy || code.length !== 6} onClick={() => void verify()} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy ? "Checking…" : "Verify & get " + rs(r.bonusPaise)}</button>
                <button type="button" disabled={busy} onClick={() => void sendCode()} className="text-xs font-semibold text-slate-500 underline">Resend</button>
                <p className="w-full text-xs text-slate-500">Code sent to {sent.phone}.{sent.devCode ? ` Test server code: ${sent.devCode}` : ""}</p>
              </div>
            )}
          </section>
        ) : w.bonus.state === "NOT_ELIGIBLE" ? <p className="mt-5 border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">The welcome bonus isn&apos;t available for this account: {w.bonus.reason}</p> : null}
        {msg ? <p className={"mt-4 px-4 py-3 text-sm " + (msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{msg.text}</p> : null}

        <h2 className="mt-10 text-lg font-bold">History</h2>
        {w.entries.length ? (
          <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-200">
            {w.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                <span><span className="block text-sm font-semibold">{KIND[e.kind] ?? e.kind}</span><span className="text-xs text-slate-500">{day(e.createdAt)}{e.expiresAt && e.amountPaise > 0 ? ` · expires ${day(e.expiresAt)}` : ""}{e.orderId ? <> · <Link href={`/account/orders/${e.orderId}`} className="underline">order</Link></> : null}</span></span>
                <span className={"font-bold " + (e.kind === "ORDER_SPEND" ? "text-slate-900" : "text-green-700")}>{e.kind === "ORDER_SPEND" ? "−" : "+"}{rs(Math.abs(e.amountPaise))}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-slate-500">Nothing yet.</p>}
      </div>
    </main>
  );
}
