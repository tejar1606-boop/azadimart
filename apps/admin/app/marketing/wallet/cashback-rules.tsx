"use client";

import { useEffect, useState } from "react";

type Data = {
  settings: { enabled: boolean; percentBps: number; maxPaise: number };
  totals: { granted: number; grantedPaise: number; forfeited: number; waitingOrders: number; waitingPaise: number };
};
const rs = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Cashback on every order: the % and cap, on/off, and what it has given so far. */
export default function CashbackRules() {
  const [data, setData] = useState<Data | null>(null);
  const [on, setOn] = useState(true);
  const [percent, setPercent] = useState("");
  const [max, setMax] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => fetch("/api/v1/marketing/cashback", { cache: "no-store" }).then((r) => r.json()).then((d: Data) => {
    setData(d); setOn(d.settings.enabled); setPercent(String(d.settings.percentBps / 100)); setMax(String(d.settings.maxPaise / 100));
  });
  useEffect(() => { void load(); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const r = await fetch("/api/v1/marketing/cashback", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: on, percentBps: Math.round(Number(percent) * 100), maxPaise: Math.round(Number(max) * 100) }) });
    const b = await r.json().catch(() => null);
    if (!r.ok) { setMsg({ ok: false, text: b?.error?.details?.[0] ? `${b.error.details[0].path?.[0]}: ${b.error.details[0].message}` : b?.error?.message ?? "Couldn't save" }); return; }
    setMsg({ ok: true, text: "Saved. Applies to orders placed from now on; earlier orders keep the cashback they were shown." }); void load();
  }
  if (!data) return null;
  const t = data.totals;
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";
  return (
    <form onSubmit={save} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Cashback on every order</h2>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />Cashback on</label></div>
      <p className="mt-1 text-xs leading-5 text-slate-500">Shoppers see the cashback at checkout. It goes into their wallet once the order is delivered and the return window closes with nothing returned or replaced (checked daily). Each seller pays the share for their items from that order&apos;s payout, only when the shopper gets it.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <label className="text-sm font-medium">Cashback (% of items)<input className={field} inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ""))} /></label>
        <label className="text-sm font-medium">Up to (₹ per order, 0 = no cap)<input className={field} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value.replace(/[^\d.]/g, ""))} /></label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {([["Added to wallets", `${t.granted} · ${rs(t.grantedPaise)}`], ["Waiting for return window", `${t.waitingOrders} · ${rs(t.waitingPaise)}`], ["Not given (returned)", String(t.forfeited)]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{l}</p><p className="mt-1 font-bold">{v}</p></div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button className="rounded-full bg-chrome px-5 py-2 text-sm font-semibold text-white">Save cashback</button>{msg ? <span className={"text-sm " + (msg.ok ? "text-green-700" : "text-red-700")}>{msg.text}</span> : null}</div>
    </form>
  );
}
