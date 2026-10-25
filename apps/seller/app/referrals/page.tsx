"use client";

import { useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Stage = "SIGNED_UP" | "APPROVED" | "REWARDED" | "NOT_COUNTED" | "CLOSED";
type Data = {
  code: string; link: string; bonusMonths: number; maxRewards: number; earned: number; remaining: number; freeUntil: string | null;
  referrals: Array<{ storeName: string; joinedAt: string; stage: Stage; freeFrom: string | null; freeTo: string | null }>;
};

const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const STAGE: Record<Stage, [string, string]> = {
  SIGNED_UP: ["Signed up · waiting for approval", "bg-slate-100 text-slate-600"],
  APPROVED: ["Approved · waiting for first delivery", "bg-amber-50 text-amber-800"],
  REWARDED: ["You earned 3 free months", "bg-green-50 text-green-700"],
  NOT_COUNTED: ["Not counted", "bg-slate-100 text-slate-500"],
  CLOSED: ["Account closed", "bg-slate-100 text-slate-500"],
};

function Copy({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); }); }} className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900">{done ? "Copied" : label}</button>;
}

/** Invite other sellers. The reward (free months) is paused while LOIMART charges no commission; the link and list still work. */
export default function ReferralsPage() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => { void fetch("/api/v1/referrals", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => undefined); }, []);
  const message = data ? `Start selling on LOIMART: 0% commission on every order, KYC-verified marketplace, LOIMART ships your orders. Join with my link: ${data.link}` : "";

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Grow sales" title="Invite sellers" description="Invite another business to sell on LOIMART with your link or code. Referral rewards (free months) are paused: LOIMART now takes 0% commission from every seller, so there is nothing extra to earn." />

      <section className="mt-6 grid gap-4">
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
      </section>


      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
        <h2 className="font-semibold">Sellers you referred</h2>
        {!data ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : data.referrals.length === 0 ? <p className="mt-3 text-sm text-slate-500">No one yet. Share your link to start earning free months.</p> : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {data.referrals.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><b>{r.storeName}</b> <span className="text-slate-500">· joined {date(r.joinedAt)}</span>{r.freeFrom && r.freeTo ? <span className="block text-xs text-green-700">Free from {date(r.freeFrom)} to {date(r.freeTo)}</span> : null}</span>
                <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + STAGE[r.stage][1]}>{STAGE[r.stage][0]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
