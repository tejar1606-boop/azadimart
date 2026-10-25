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
type Referrals = {
  enabled: boolean; unlocked: boolean; code: string | null; rewardPaise: number; expiryDays: number; returnWindowDays: number; earnedPaise: number;
  friends: Array<{ name: string; joinedAt: string; state: "JOINED" | "ORDERED" | "DELIVERED" | "RETURNED" | "REWARDED" | "NOT_ELIGIBLE"; dueAt: string | null; reason: string | null; amountPaise: number }>;
};
const KIND: Record<string, string> = { SIGNUP_BONUS: "Welcome bonus", REFERRAL_REWARD: "Referral reward", ORDER_CASHBACK: "Order cashback", ORDER_SPEND: "Used on an order", ORDER_REFUND: "Order cancelled: money back", ADJUSTMENT: "Adjustment by LOIMART" };

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
  const [refer, setRefer] = useState<Referrals | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ phone: string; devCode?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);

  const load = useCallback(async () => { try { setW(await api("/api/v1/wallet")); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't load your wallet" }); } }, []);
  useEffect(() => { void load(); fetch("/api/v1/wallet/referrals", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setRefer).catch(() => undefined); }, [load]);

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

        {refer?.enabled ? <ReferAndEarn r={refer} /> : null}

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

const FRIEND_STATE = {
  JOINED: { text: "Signed up: waiting for their first order", cls: "text-slate-500" },
  ORDERED: { text: "Ordered: waiting for delivery", cls: "text-amber-700" },
  DELIVERED: { text: "Delivered: reward if not returned", cls: "text-amber-700" },
  RETURNED: { text: "Returned: waiting for an order they keep", cls: "text-slate-500" },
  REWARDED: { text: "Reward added", cls: "text-green-700" },
  NOT_ELIGIBLE: { text: "No reward", cls: "text-red-700" },
} as const;

/** Refer & earn: unlocked by the shopper's first order; pays when an invited friend's first order is delivered. */
function ReferAndEarn({ r }: { r: Referrals }) {
  const [copied, setCopied] = useState(false);
  const link = r.code && typeof window !== "undefined" ? `${window.location.origin}/register?ref=${r.code}` : "";
  const message = `Join me on LOIMART! Sign up with my code ${r.code} and get ${rs(r.rewardPaise)} in your wallet: ${link}`;
  async function share() {
    if (navigator.share) { try { await navigator.share({ title: "LOIMART", text: message }); return; } catch { /* closed: fall back to copy */ } }
    await navigator.clipboard?.writeText(message).catch(() => undefined);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  return (
    <section id="refer" className="mt-8 scroll-mt-24 border border-slate-200 p-5 sm:p-6">
      <p className="text-lg font-bold">🤝 Refer &amp; earn {rs(r.rewardPaise)}</p>
      <p className="mt-1 text-sm text-slate-600">Invite friends to LOIMART. When a friend you invited gets their first order <b>delivered and keeps it</b> (no return or replacement within {r.returnWindowDays} days of delivery), {rs(r.rewardPaise)} lands in your wallet. Every friend who orders can then invite their own friends too.</p>
      {!r.unlocked ? (
        <div className="mt-4 bg-slate-50 p-4 text-sm text-slate-700">🔒 Place your first order to unlock your referral code. <Link href="/products" className="font-bold text-[#6A2CD6] underline">Shop now</Link></div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="border-2 border-dashed border-[#6A2CD6] px-4 py-2 font-mono text-xl font-black tracking-widest text-[#2A0E5F]">{r.code}</span>
            <button type="button" onClick={() => void share()} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">{copied ? "Copied ✓" : "Share"}</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white">WhatsApp</a>
          </div>
          <p className="mt-2 break-all text-xs text-slate-500">{link}</p>
          <p className="mt-4 text-sm"><b>{r.friends.length}</b> invited · <b>{r.friends.filter((f) => f.state === "REWARDED").length}</b> rewarded · <b className="text-green-700">{rs(r.earnedPaise)}</b> earned</p>
          {r.friends.length ? (
            <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-200">
              {r.friends.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span><span className="font-semibold">{f.name}</span><span className="block text-xs text-slate-500">Joined {day(f.joinedAt)}</span></span>
                  <span className={"text-right text-xs font-semibold " + FRIEND_STATE[f.state].cls}>{f.state === "REWARDED" ? `+${rs(f.amountPaise)} · ` : ""}{FRIEND_STATE[f.state].text}{f.dueAt ? <span className="block font-normal">on {day(f.dueAt)}</span> : null}{f.reason ? <span className="block font-normal">{f.reason}</span> : null}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">Rewards are LOIMART wallet money: use within {r.expiryDays} days, like the welcome bonus. Your friend must use a different phone and their own mobile number.</p>
        </>
      )}
    </section>
  );
}
