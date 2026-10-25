"use client";

import { useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import CashbackRules from "./cashback-rules";

type Settings = { enabled: boolean; bonusPaise: number; maxPerOrderPaise: number; minOrderPaise: number; expiryDays: number; maxBonusesPerIpPerDay: number; referralEnabled: boolean; referralRewardPaise: number; maxReferralRewards: number };
type Data = {
  settings: Settings;
  totals: { given: number; bonuses: number; referralGiven: number; referralRewards: number; spent: number; refunded: number; outstanding: number; expired: number };
  reasons: Array<{ reason: string | null; n: number }>;
  claims: Array<{ id: string; status: "GRANTED" | "BLOCKED"; reason: string | null; phone: string; deviceId: string | null; ipAddress: string | null; createdAt: string; customerName: string | null }>;
  referrals: Array<{ id: string; status: "GRANTED" | "BLOCKED"; reason: string | null; amountPaise: number; createdAt: string; referrerName: string; friendName: string }>;
};
const rs = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Shopper wallet: welcome-bonus rules, what it has cost, and every claim (granted or blocked, with why). */
export default function WalletAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Record<keyof Settings, string> | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [referralOn, setReferralOn] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => fetch("/api/v1/marketing/wallet", { cache: "no-store" }).then((r) => r.json()).then((d: Data) => {
    setData(d); setEnabled(d.settings.enabled); setReferralOn(d.settings.referralEnabled);
    setForm({ enabled: "", referralEnabled: "", referralRewardPaise: String(d.settings.referralRewardPaise / 100), maxReferralRewards: String(d.settings.maxReferralRewards), bonusPaise: String(d.settings.bonusPaise / 100), maxPerOrderPaise: String(d.settings.maxPerOrderPaise / 100), minOrderPaise: String(d.settings.minOrderPaise / 100), expiryDays: String(d.settings.expiryDays), maxBonusesPerIpPerDay: String(d.settings.maxBonusesPerIpPerDay) });
  });
  useEffect(() => { void load(); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!form) return;
    const body = { enabled, bonusPaise: Math.round(Number(form.bonusPaise) * 100), maxPerOrderPaise: Math.round(Number(form.maxPerOrderPaise) * 100), minOrderPaise: Math.round(Number(form.minOrderPaise) * 100), expiryDays: Math.round(Number(form.expiryDays)), maxBonusesPerIpPerDay: Math.round(Number(form.maxBonusesPerIpPerDay)), referralEnabled: referralOn, referralRewardPaise: Math.round(Number(form.referralRewardPaise) * 100), maxReferralRewards: Math.round(Number(form.maxReferralRewards)) };
    const r = await fetch("/api/v1/marketing/wallet", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => null);
    if (!r.ok) { setMsg({ ok: false, text: b?.error?.details?.[0] ? `${b.error.details[0].path?.[0]}: ${b.error.details[0].message}` : b?.error?.message ?? "Couldn't save" }); return; }
    setMsg({ ok: true, text: "Saved. New rules apply to new bonuses and orders from now on." }); void load();
  }
  if (!data || !form) return <main className="p-10 text-sm text-slate-500">Loading…</main>;
  const t = data.totals;
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value.replace(/[^\d.]/g, "") });

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Marketing" title="Wallet, bonus, referrals & cashback" description="New shoppers get a welcome bonus in their LOIMART wallet after verifying their mobile by OTP: once per mobile number and once per device (device ID + fingerprint), with a daily limit per internet connection. After their first order, shoppers can refer friends: when a friend's first order is delivered and kept past the return window (no return or replacement), the shopper who invited them gets the referral reward (checked daily). LOIMART pays for wallet money; sellers get their full price." />
      <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {([["Bonuses given", `${t.bonuses} · ${rs(t.given)}`], ["Referral rewards", `${t.referralRewards} · ${rs(t.referralGiven)}`], ["Used on orders", rs(t.spent - t.refunded)], ["Still in wallets", rs(t.outstanding)], ["Expired unused", rs(t.expired)], ["Blocked attempts", String(data.reasons.reduce((n, r) => n + r.n, 0))]] as const).map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"><p className="text-xs text-slate-500">{l}</p><p className="mt-1 text-xl font-bold">{v}</p></div>
        ))}
      </div>

      <form onSubmit={save} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Rules</h2>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Welcome bonus &amp; wallet on</label></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <label className="text-sm font-medium">Welcome bonus (₹)<input className={field} inputMode="decimal" value={form.bonusPaise} onChange={set("bonusPaise")} /></label>
          <label className="text-sm font-medium">Use up to (₹ per order)<input className={field} inputMode="decimal" value={form.maxPerOrderPaise} onChange={set("maxPerOrderPaise")} /></label>
          <label className="text-sm font-medium">On orders of at least (₹)<input className={field} inputMode="decimal" value={form.minOrderPaise} onChange={set("minOrderPaise")} /></label>
          <label className="text-sm font-medium">Bonus expires after (days)<input className={field} inputMode="numeric" value={form.expiryDays} onChange={set("expiryDays")} /></label>
          <label className="text-sm font-medium">Bonuses per connection a day<input className={field} inputMode="numeric" value={form.maxBonusesPerIpPerDay} onChange={set("maxBonusesPerIpPerDay")} /></label>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold">Refer &amp; earn</h3>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={referralOn} onChange={(e) => setReferralOn(e.target.checked)} />Referral rewards on</label></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <label className="text-sm font-medium">Reward per friend (₹)<input className={field} inputMode="decimal" value={form.referralRewardPaise} onChange={set("referralRewardPaise")} /></label>
          <label className="text-sm font-medium">Most rewards per shopper (0 = no limit)<input className={field} inputMode="numeric" value={form.maxReferralRewards} onChange={set("maxReferralRewards")} /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><button className="rounded-full bg-chrome px-5 py-2 text-sm font-semibold text-white">Save rules</button>{msg ? <span className={"text-sm " + (msg.ok ? "text-green-700" : "text-red-700")}>{msg.text}</span> : null}</div>
      </form>
      <CashbackRules />

      {data.reasons.length ? <div className="mt-5 flex flex-wrap gap-2">{data.reasons.map((r) => <span key={r.reason ?? "?"} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800">{r.n} × {r.reason}</span>)}</div> : null}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-card">
        <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">Recent claims</h2>
        {!data.claims.length ? <p className="p-6 text-sm text-slate-500">No claims yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2.5">When</th><th className="px-3">Shopper</th><th className="px-3">Mobile</th><th className="px-3">Device · IP</th><th className="px-5">Result</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{data.claims.map((c) => (
              <tr key={c.id}><td className="px-5 py-2.5 text-xs text-slate-600">{new Date(c.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td><td className="px-3">{c.customerName ?? "—"}</td><td className="px-3 font-mono text-xs">{c.phone}</td><td className="px-3 font-mono text-xs text-slate-500">{c.deviceId ?? "no device id"} · {c.ipAddress ?? "—"}</td>
                <td className="px-5">{c.status === "GRANTED" ? <span className="font-semibold text-green-700">✓ Given</span> : <span className="text-xs font-semibold text-red-700">Blocked: {c.reason}</span>}</td></tr>
            ))}</tbody></table></div>
        )}
      </section>
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-card">
        <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">Recent referrals <span className="text-xs font-normal text-slate-500">(written once the invited friend&apos;s first order is delivered and the return window closes without a return)</span></h2>
        {!data.referrals.length ? <p className="p-6 text-sm text-slate-500">No referral rewards yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2.5">When</th><th className="px-3">Invited by</th><th className="px-3">Friend</th><th className="px-5">Result</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{data.referrals.map((x) => (
              <tr key={x.id}><td className="px-5 py-2.5 text-xs text-slate-600">{new Date(x.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td><td className="px-3">{x.referrerName}</td><td className="px-3">{x.friendName}</td>
                <td className="px-5">{x.status === "GRANTED" ? <span className="font-semibold text-green-700">✓ {rs(x.amountPaise)} given</span> : <span className="text-xs font-semibold text-red-700">Not given: {x.reason}</span>}</td></tr>
            ))}</tbody></table></div>
        )}
      </section>
    </main>
  );
}
