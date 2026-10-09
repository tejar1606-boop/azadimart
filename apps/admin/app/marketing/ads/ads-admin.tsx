"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalPageHeader, StatCard } from "@azadimart/ui";

type Slot = { id: string; name: string; placement: string; description: string; basePricePaise: number; buyNowPricePaise: number | null; bidIncrementPaise: number; closeHoursBefore: number; isActive: boolean };
type Booking = { id: string; slotId: string; day: string; amountPaise: number; kind: string; status: "WON" | "ACTIVE"; impressions: number; clicks: number; storeName: string; headline: string; campaignStatus: string };
type Ad = { id: string; status: "PENDING_REVIEW" | "APPROVED" | "REJECTED"; headline: string; reviewNote: string | null; storeName: string; slotName: string; productTitle: string; productSlug: string; desktopImageUrl: string; mobileImageUrl: string | null; bookedDays: number; updatedAt: string };
type Day = { day: string; status: string; topBidPaise: number | null; bidCount: number; holder: string | null };

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
const todayKey = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const EMPTY = { name: "", placement: "HOME_HERO", description: "", base: "", buyNow: "", step: "100", closeHoursBefore: "12", isActive: true };

function SlotForm({ slot, onSaved, onCancel }: { slot: Slot | null; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState(slot ? { name: slot.name, placement: slot.placement, description: slot.description, base: String(slot.basePricePaise / 100), buyNow: slot.buyNowPricePaise ? String(slot.buyNowPricePaise / 100) : "", step: String(slot.bidIncrementPaise / 100), closeHoursBefore: String(slot.closeHoursBefore), isActive: slot.isActive } : EMPTY);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const field = "mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900";
  const num = (k: "base" | "buyNow" | "step" | "closeHoursBefore") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, "") });
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch(slot ? `/api/v1/ads/slots/${slot.id}` : "/api/v1/ads/slots", {
        method: slot ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name, placement: f.placement, description: f.description, basePricePaise: Number(f.base) * 100, buyNowPricePaise: f.buyNow ? Number(f.buyNow) * 100 : null, bidIncrementPaise: Number(f.step) * 100, closeHoursBefore: Number(f.closeHoursBefore), isActive: f.isActive }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't save");
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save"); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Name<input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Home banner – slot 1" /></label>
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Where it shows<select className={field} value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })}><option value="HOME_HERO">Home page main banner (first slide, “Sponsored”)</option></select></label>
      <label className="text-xs font-semibold text-slate-600">Starting bid per day (₹)<input className={field} inputMode="numeric" value={f.base} onChange={num("base")} placeholder="500" /></label>
      <label className="text-xs font-semibold text-slate-600">Book-now price per day (₹, optional)<input className={field} inputMode="numeric" value={f.buyNow} onChange={num("buyNow")} placeholder="2000" /></label>
      <label className="text-xs font-semibold text-slate-600">Each new bid beats the last by (₹)<input className={field} inputMode="numeric" value={f.step} onChange={num("step")} /></label>
      <label className="text-xs font-semibold text-slate-600">Bidding closes (hours before the day)<input className={field} inputMode="numeric" value={f.closeHoursBefore} onChange={num("closeHoursBefore")} /></label>
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-3">Note for sellers (optional)<input className={field} value={f.description} maxLength={300} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Shown to every shopper on the home page; about 1 lakh views a day" /></label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="h-4 w-4 accent-[#ff9933]" />On sale</label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
        <button type="button" disabled={busy || f.name.trim().length < 3 || !f.base || !f.step} onClick={() => void save()} className="rounded-full bg-chrome px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : slot ? "Save changes" : "Create ad space"}</button>
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}

function AdminCalendar({ slot, onChanged }: { slot: Slot; onChanged: () => void }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const body = await fetch(`/api/v1/ads/slots/${slot.id}/calendar`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setDays(body?.days ?? []);
  }, [slot.id]);
  useEffect(() => { void load(); }, [load]);
  async function setClosed(closed: boolean) {
    setError("");
    const response = await fetch(`/api/v1/ads/slots/${slot.id}/closed-days`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: picked, closed }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setError(body?.error?.message ?? "Couldn't update"); return; }
    setPicked([]); await load(); onChanged();
  }
  if (!days) return <div className="h-48 animate-pulse rounded-xl bg-slate-100" />;
  const pad = (new Date(days[0]!.day + "T00:00:00Z").getUTCDay() + 6) % 7;
  const tone: Record<string, string> = { OPEN: "bg-green-50 ring-green-200", BIDDING: "bg-amber-50 ring-amber-200", BOOKED: "bg-sky-100 ring-sky-300", CLOSED: "bg-slate-200 ring-slate-300 text-slate-500", UNAVAILABLE: "bg-slate-50 ring-slate-100 text-slate-300" };
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-slate-400">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}
        {Array.from({ length: pad }, (_, i) => <span key={"p" + i} />)}
        {days.map((d) => {
          const on = picked.includes(d.day);
          return (
            <button key={d.day} type="button" onClick={() => setPicked((p) => (on ? p.filter((x) => x !== d.day) : [...p, d.day]))} disabled={d.status === "UNAVAILABLE"}
              className={"flex min-h-[64px] flex-col items-center justify-center rounded-lg px-0.5 text-[10px] normal-case ring-1 " + (on ? "bg-chrome text-white ring-chrome" : tone[d.status])}>
              <b className="text-[12px]">{dayLabel(d.day, { day: "numeric", month: "short" })}</b>
              <span className="line-clamp-1 font-semibold">{d.status === "BOOKED" ? d.holder : d.status === "BIDDING" ? `${money(d.topBidPaise!)} · ${d.bidCount}` : d.status === "CLOSED" ? "Closed" : d.status === "OPEN" ? "Open" : "—"}</span>
              {d.status === "BIDDING" && d.holder ? <span className="line-clamp-1 opacity-70">{d.holder}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">{picked.length ? `${picked.length} day(s) picked` : "Pick days to take them off sale (e.g. for AzadiMart's own sale banner) or put them back."}</span>
        {picked.length ? <><button type="button" onClick={() => void setClosed(true)} className="rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white">Close days</button><button type="button" onClick={() => void setClosed(false)} className="rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 ring-slate-300">Reopen days</button></> : null}
        {error ? <p role="alert" className="w-full text-sm text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}

export default function AdsAdmin({ storefrontUrl }: { storefrontUrl: string }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [editing, setEditing] = useState<Slot | "new" | null>(null);
  const [calendarFor, setCalendarFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch("/api/v1/ads/slots", { cache: "no-store" }).then((r) => r.json()), fetch("/api/v1/ads/campaigns", { cache: "no-store" }).then((r) => r.json())]);
      setSlots(a.slots ?? []); setBookings(a.bookings ?? []); setAds(b.items ?? []); setLoaded(true);
      setCalendarFor((c) => c ?? (a.slots ?? []).find((s: Slot) => s.isActive)?.id ?? a.slots?.[0]?.id ?? null);
    } catch { setError("Couldn't load ads"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function review(ad: Ad, decision: "APPROVED" | "REJECTED") {
    const note = decision === "REJECTED" ? window.prompt("What should the seller change?", "Banner text is hard to read") : "";
    if (decision === "REJECTED" && (!note || note.trim().length < 3)) return;
    const response = await fetch(`/api/v1/ads/campaigns/${ad.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note }) });
    if (!response.ok) setError((await response.json().catch(() => null))?.error?.message ?? "Couldn't update");
    await load();
  }
  async function withdraw(b: Booking) {
    const reason = window.prompt(`Withdraw ${b.storeName}'s booking for ${dayLabel(b.day)}? They won't be charged. Reason:`, "");
    if (!reason || reason.trim().length < 3) return;
    const response = await fetch(`/api/v1/ads/bids/${b.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    if (!response.ok) setError((await response.json().catch(() => null))?.error?.message ?? "Couldn't withdraw");
    await load();
  }

  const today = todayKey();
  const upcoming = bookings.filter((b) => b.status === "WON" && b.day >= today);
  const past = bookings.filter((b) => b.status === "WON" && b.day < today);
  const slotName = (id: string) => slots.find((s) => s.id === id)?.name ?? "";
  const calendarSlot = slots.find((s) => s.id === calendarFor) ?? null;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Storefront" title="Seller ads" description="Sell home page banner days to sellers. You set the prices; sellers bid or book instantly; each day goes to the highest bid when bidding closes. Charges come out of the seller's next payout, only for days their approved ad ran." />
      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {loaded ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Booked revenue (upcoming)" value={money(upcoming.reduce((s, b) => s + b.amountPaise, 0))} hint={`${upcoming.length} day(s) booked`} icon="finance" tone="good" />
          <StatCard label="Live bids" value={String(bookings.filter((b) => b.status === "ACTIVE").length)} hint={money(bookings.filter((b) => b.status === "ACTIVE").reduce((s, b) => s + b.amountPaise, 0)) + " top bids"} icon="marketing" tone="brand" />
          <StatCard label="Ads waiting for review" value={String(ads.filter((a) => a.status === "PENDING_REVIEW").length)} icon="qc" tone="warn" />
          <StatCard label="Last 30 days: views · clicks" value={`${past.reduce((s, b) => s + b.impressions, 0).toLocaleString("en-IN")} · ${past.reduce((s, b) => s + b.clicks, 0).toLocaleString("en-IN")}`} icon="sparkle" />
        </div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Ad spaces and prices</h2>
          {editing ? null : <button type="button" onClick={() => setEditing("new")} className="rounded-full bg-chrome px-4 py-2 text-xs font-semibold text-white">+ New ad space</button>}
        </div>
        {editing === "new" ? <div className="mt-3"><SlotForm slot={null} onSaved={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} /></div> : null}
        {slots.length === 0 && editing !== "new" ? <p className="mt-3 text-sm text-slate-500">No ad spaces yet. Create one, e.g. “Home banner – slot 1” at ₹500/day.</p> : null}
        <ul className="mt-3 divide-y divide-slate-100">
          {slots.map((s) => (
            <li key={s.id} className="py-3">
              {editing !== "new" && editing?.id === s.id ? <SlotForm slot={s} onSaved={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} /> : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{s.name} {s.isActive ? null : <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">OFF SALE</span>}</p>
                    <p className="text-xs text-slate-500">Bids from {money(s.basePricePaise)}/day · step {money(s.bidIncrementPaise)}{s.buyNowPricePaise ? ` · book now ${money(s.buyNowPricePaise)}/day` : " · no book-now"} · bidding closes {s.closeHoursBefore} h before the day</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setCalendarFor(s.id)} className={"rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 " + (calendarFor === s.id ? "bg-orange-50 ring-brand" : "ring-slate-300")}>Calendar</button>
                    <button type="button" onClick={() => setEditing(s)} className="rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-slate-300">Edit prices</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {calendarSlot ? (
        <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h2 className="mb-3 font-semibold">Calendar · {calendarSlot.name}</h2>
          <AdminCalendar key={calendarSlot.id} slot={calendarSlot} onChanged={() => void load()} />
        </section>
      ) : null}

      <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <h2 className="font-semibold">Ads to review</h2>
        {ads.length === 0 ? <p className="mt-2 text-sm text-slate-500">No seller ads yet.</p> : (
          <ul className="mt-3 space-y-3">
            {ads.map((ad) => (
              <li key={ad.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 lg:flex-row lg:items-center">
                <div className="flex shrink-0 gap-2">
                  <a href={ad.desktopImageUrl} target="_blank" rel="noreferrer" className="aspect-[8/3] w-56 rounded-lg bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url("${ad.desktopImageUrl}")` }} aria-label="Desktop banner" />
                  {ad.mobileImageUrl ? <a href={ad.mobileImageUrl} target="_blank" rel="noreferrer" className="aspect-[4/5] w-16 rounded-lg bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url("${ad.mobileImageUrl}")` }} aria-label="Mobile banner" /> : null}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{ad.headline}</p>
                  <p className="text-xs text-slate-500">{ad.storeName} · {ad.slotName} · links to <a className="underline" href={`${storefrontUrl}/products/${ad.productSlug}`} target="_blank" rel="noreferrer">{ad.productTitle}</a> · {ad.bookedDays} day(s) booked</p>
                  {ad.reviewNote ? <p className="mt-1 text-xs text-red-700">Note: {ad.reviewNote}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + (ad.status === "APPROVED" ? "bg-green-50 text-green-700" : ad.status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800")}>{ad.status === "PENDING_REVIEW" ? "Waiting" : ad.status}</span>
                  {ad.status !== "APPROVED" ? <button type="button" onClick={() => void review(ad, "APPROVED")} className="rounded-full bg-green-600 px-3 py-1.5 text-xs font-bold text-white">Approve</button> : null}
                  {ad.status !== "REJECTED" ? <button type="button" onClick={() => void review(ad, "REJECTED")} className="rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-slate-300">Reject</button> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Bookings and live bids</h2></div>
        {bookings.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">No bookings yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-2.5 font-semibold">Day</th><th className="px-3 py-2.5 font-semibold">Seller · ad</th><th className="px-3 py-2.5 font-semibold">Space</th><th className="px-3 py-2.5 text-right font-semibold">Price</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-3 py-2.5 text-right font-semibold">Views · clicks</th><th className="px-5 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td className="px-5 py-2.5">{dayLabel(b.day)}{b.day === today && b.status === "WON" ? <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">LIVE</span> : null}</td>
                    <td className="px-3 py-2.5"><b>{b.storeName}</b><span className="block text-xs text-slate-500">{b.headline}{b.campaignStatus !== "APPROVED" ? " · ad not approved yet" : ""}</span></td>
                    <td className="px-3 py-2.5 text-slate-600">{slotName(b.slotId)}</td>
                    <td className="px-3 py-2.5 text-right">{money(b.amountPaise)}<span className="block text-[10px] text-slate-400">{b.kind === "BUY_NOW" ? "booked now" : "bid"}</span></td>
                    <td className="px-3 py-2.5"><span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + (b.status === "WON" ? "bg-green-50 text-green-700" : "bg-sky-50 text-sky-700")}>{b.status === "WON" ? "Booked" : "Top bid"}</span></td>
                    <td className="px-3 py-2.5 text-right">{b.status === "WON" ? `${b.impressions.toLocaleString("en-IN")} · ${b.clicks.toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-5 py-2.5 text-right">{b.day >= today ? <button type="button" onClick={() => void withdraw(b)} className="text-xs font-semibold text-red-700">Withdraw</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
