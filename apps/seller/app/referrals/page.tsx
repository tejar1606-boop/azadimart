"use client";

import { useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import { FREE_AD_DAY_TERMS } from "@azadimart/shared";

type Stage = "SIGNED_UP" | "APPROVED" | "REWARDED" | "NOT_COUNTED" | "CLOSED";
type Data = {
  code: string; link: string; maxRewards: number; earned: number; available: number; remaining: number;
  referrals: Array<{ storeName: string; joinedAt: string; stage: Stage; used: boolean }>;
};

const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const STAGE: Record<Stage, [string, string]> = {
  SIGNED_UP: ["Signed up · waiting for approval", "bg-slate-100 text-slate-600"],
  APPROVED: ["Approved · waiting for first delivery", "bg-amber-50 text-amber-800"],
  REWARDED: ["You earned a free ad day", "bg-green-50 text-green-700"],
  NOT_COUNTED: ["Not counted", "bg-slate-100 text-slate-500"],
  CLOSED: ["Account closed", "bg-slate-100 text-slate-500"],
};

function Copy({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); }); }} className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900">{done ? "Copied" : label}</button>;
}

/** Refer & earn: invite other sellers; each one's first delivery gives you a free ad day (one product, one day). */
export default function ReferralsPage() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => { void fetch("/api/v1/referrals", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => undefined); }, []);
  const message = data ? `Start selling on LOIMART: 0% commission on every order, KYC-verified marketplace, LOIMART ships your orders. Join with my link: ${data.link}` : "";

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Grow sales" title="Refer & earn" description="Invite another business to sell on LOIMART. When they're approved and deliver their first order, you get a free ad day: advertise one of your products for a day at no cost." />

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Your referral code</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="font-mono text-3xl font-bold tracking-[0.08em]">{data?.code ?? "…"}</p>
            {data ? <Copy value={data.code} label="Copy code" /> : null}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Your invite link</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2.5 font-mono text-sm">{data?.link ?? "…"}</p>
            {data ? <Copy value={data.link} label="Copy link" /> : null}
          </div>
          {data ? <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white">Share on WhatsApp</a> : null}
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Free ad days</p>
          <p className="mt-1 text-3xl font-semibold">{data ? data.available : "…"} <span className="text-base font-normal text-slate-500">to use{data ? ` · ${data.earned} earned of ${data.maxRewards}` : ""}</span></p>
          <div className="mt-3 flex gap-1.5">{Array.from({ length: data?.maxRewards ?? 4 }).map((_, i) => <span key={i} className={"h-2 flex-1 rounded-full " + (data && i < data.earned ? "bg-green-600" : "bg-slate-200")} />)}</div>
          {data?.available ? <a href="/ads" className="mt-4 inline-flex rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white">Use it in Ads</a> : null}
          {data ? <p className="mt-3 text-xs text-slate-500">{data.remaining ? `${data.remaining} more referral${data.remaining === 1 ? "" : "s"} can earn free ad days.` : "You've earned the most free ad days from referrals."}</p> : null}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
        <h2 className="font-semibold">How it works</h2>
        <ol className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
          {["Share your link or code with a business that wants to sell online.", "They sign up with it and LOIMART approves their KYC.", "When their first order is delivered, you get a free ad day for one of your products."].map((t, i) => (
            <li key={i} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-bold text-white">{i + 1}</span><span>{t}</span></li>
          ))}
        </ol>
        <h3 className="mt-5 text-sm font-semibold">Terms &amp; conditions</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
          {FREE_AD_DAY_TERMS.map((t) => <li key={t}>{t}</li>)}
          <li>Up to {data?.maxRewards ?? 4} free ad days from referrals. Referring your own business (same GSTIN or PAN) doesn&apos;t count.</li>
        </ul>
      </section>


      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
        <h2 className="font-semibold">Sellers you referred</h2>
        {!data ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : data.referrals.length === 0 ? <p className="mt-3 text-sm text-slate-500">No one yet. Share your link to start earning free ad days.</p> : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {data.referrals.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><b>{r.storeName}</b> <span className="text-slate-500">· joined {date(r.joinedAt)}</span>{r.stage === "REWARDED" ? <span className="block text-xs text-green-700">{r.used ? "Free ad day used" : "Free ad day ready to use"}</span> : null}</span>
                <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + STAGE[r.stage][1]}>{STAGE[r.stage][0]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
