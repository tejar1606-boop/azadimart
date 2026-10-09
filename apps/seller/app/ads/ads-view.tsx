"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { directUpload, StatCard } from "@azadimart/ui";

type Slot = { id: string; name: string; placementLabel: string; description: string; basePricePaise: number; buyNowPricePaise: number | null; bidIncrementPaise: number; closeHoursBefore: number };
type Campaign = { id: string; slotId: string; productId: string; productTitle: string; headline: string; status: "PENDING_REVIEW" | "APPROVED" | "REJECTED"; reviewNote: string | null; desktopImageAssetId: string; mobileImageAssetId: string | null; desktopImageUrl: string; mobileImageUrl: string | null };
type Bid = { id: string; slotId: string; slotName: string; campaignId: string; day: string; amountPaise: number; kind: string; status: "ACTIVE" | "OUTBID" | "WON" | "LOST" | "CANCELLED"; impressions: number; clicks: number };
type Charge = { id: string; description: string; amountPaise: number; status: string; createdAt: string };
type Data = { today: string; slots: Slot[]; campaigns: Campaign[]; bids: Bid[]; charges: Charge[]; totals: { impressions: number; clicks: number; pendingChargesPaise: number } };
type Day = { day: string; status: "OPEN" | "BIDDING" | "BOOKED" | "CLOSED" | "UNAVAILABLE"; closesAt: string; topBidPaise: number | null; bidCount: number; minimumBidPaise: number; buyNowPaise: number | null; mine: { status: string; amountPaise: number } | null };
type Product = { id: string; title: string; status: string };

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
const BID_STATUS: Record<Bid["status"], { label: string; tone: string }> = {
  ACTIVE: { label: "Top bid", tone: "bg-sky-50 text-sky-700" },
  OUTBID: { label: "Outbid", tone: "bg-amber-50 text-amber-800" },
  WON: { label: "Booked", tone: "bg-green-50 text-green-700" },
  LOST: { label: "Lost", tone: "bg-slate-100 text-slate-500" },
  CANCELLED: { label: "Withdrawn", tone: "bg-red-50 text-red-700" },
};
const AD_STATUS = { PENDING_REVIEW: { label: "In review", tone: "bg-amber-50 text-amber-800" }, APPROVED: { label: "Approved", tone: "bg-green-50 text-green-700" }, REJECTED: { label: "Needs changes", tone: "bg-red-50 text-red-700" } };

/** Product, headline and banners for an ad space. */
function AdForm({ slot, existing, products, onSaved }: { slot: Slot; existing: Campaign | null; products: Product[]; onSaved: () => void }) {
  const [productId, setProductId] = useState(existing?.productId ?? "");
  const [headline, setHeadline] = useState(existing?.headline ?? "");
  const [desktop, setDesktop] = useState<{ id: string; url: string } | null>(existing ? { id: existing.desktopImageAssetId, url: existing.desktopImageUrl } : null);
  const [mobile, setMobile] = useState<{ id: string; url: string } | null>(existing?.mobileImageAssetId ? { id: existing.mobileImageAssetId, url: existing.mobileImageUrl! } : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function upload(file: File, which: "desktop" | "mobile") {
    setBusy(which); setError("");
    try {
      const result = await directUpload(file, { purpose: "AD_IMAGE", altText: headline || "Ad banner" });
      (which === "desktop" ? setDesktop : setMobile)({ id: result.mediaAssetId, url: result.url });
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed"); } finally { setBusy(null); }
  }
  async function save() {
    setBusy("save"); setError("");
    try {
      const response = await fetch(existing ? `/api/v1/ads/campaigns/${existing.id}` : "/api/v1/ads/campaigns", {
        method: existing ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, productId, headline, desktopImageAssetId: desktop?.id, mobileImageAssetId: mobile?.id ?? null }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't save the ad");
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save the ad"); } finally { setBusy(null); }
  }
  const field = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm outline-none focus:border-slate-900";
  const picker = (which: "desktop" | "mobile", value: { url: string } | null, size: string, aspect: string) => (
    <label className="block cursor-pointer">
      <span className="text-xs font-semibold text-slate-600">{which === "desktop" ? "Desktop banner (required)" : "Mobile banner (optional)"} · {size}</span>
      <span className={"mt-1 flex items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 bg-cover bg-center text-xs font-semibold text-slate-500 hover:border-slate-900 " + aspect} style={value ? { backgroundImage: `url("${value.url}")` } : undefined}>
        {busy === which ? "Uploading…" : value ? "" : "Upload JPG, PNG or WebP"}
      </span>
      <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, which); e.currentTarget.value = ""; }} />
    </label>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-600">Product to advertise
          <select className={field + " mt-1"} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Choose a live product</option>
            {products.filter((p) => p.status === "LIVE").map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">Headline (for screen readers and review)
          <input className={field + " mt-1"} value={headline} maxLength={60} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Festive kitchen sale – up to 40% off" />
        </label>
        {picker("desktop", desktop, "2880 × 1080", "aspect-[8/3]")}
      </div>
      {picker("mobile", mobile, "1200 × 1500", "aspect-[4/5]")}
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <button type="button" disabled={!productId || headline.trim().length < 3 || !desktop || Boolean(busy)} onClick={() => void save()} className="h-11 rounded-full bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">{busy === "save" ? "Saving…" : existing ? "Save changes (re-review)" : "Send ad for review"}</button>
        <p className="text-xs text-slate-500">AzadiMart checks every ad before it runs. Show your own product, no misleading claims or other brands&apos; logos.</p>
      </div>
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 lg:col-span-2">{error}</p> : null}
    </div>
  );
}

/** 60-day calendar: pick days, then bid or book instantly. */
function Calendar({ slot, campaign, onDone }: { slot: Slot; campaign: Campaign; onDone: () => void }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Array<{ day: string; ok: boolean; status?: string; amountPaise?: number; reason?: string }>>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const body = await fetch(`/api/v1/ads/slots/${slot.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setDays(body?.days ?? []);
  }, [slot.id]);
  useEffect(() => { void load(); }, [load]);

  const selectable = (d: Day) => (d.status === "OPEN" || d.status === "BIDDING") && d.mine?.status !== "WON";
  const chosen = (days ?? []).filter((d) => picked.includes(d.day));
  const minBid = chosen.reduce((m, d) => Math.max(m, d.mine?.status === "ACTIVE" ? d.topBidPaise! + 100 : d.minimumBidPaise), 0);
  const buyNow = chosen.length && chosen.every((d) => d.buyNowPaise != null) ? chosen.reduce((s, d) => s + d.buyNowPaise!, 0) : null;

  async function submit(mode: "BID" | "BUY_NOW") {
    setBusy(true); setError(""); setResults([]);
    try {
      const response = await fetch("/api/v1/ads/bids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: campaign.id, days: picked, mode, amountPaise: mode === "BID" ? Math.round(Number(amount) * 100) : undefined }) });
      const body = await response.json().catch(() => null);
      if (!body?.results) throw new Error(body?.error?.message ?? "Couldn't place the bid");
      setResults(body.results); setPicked([]); setAmount("");
      await load(); onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't place the bid"); } finally { setBusy(false); }
  }

  if (!days) return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  const pad = (new Date(days[0]!.day + "T00:00:00Z").getUTCDay() + 6) % 7; // weeks start on Monday
  const cell: Record<Day["status"], string> = {
    OPEN: "bg-green-50 text-green-900 ring-green-200 hover:ring-green-600",
    BIDDING: "bg-amber-50 text-amber-900 ring-amber-200 hover:ring-amber-600",
    BOOKED: "bg-slate-200 text-slate-500 ring-slate-200",
    CLOSED: "bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)] text-slate-400 ring-slate-200",
    UNAVAILABLE: "bg-slate-50 text-slate-300 ring-slate-100",
  };
  return (
    <div>
      <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-slate-600">
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-green-100 ring-1 ring-green-300" />Open</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-300" />Bidding (top bid shown)</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-slate-300" />Booked</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-brand" />Picked</span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-slate-400 sm:gap-1.5">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}
        {Array.from({ length: pad }, (_, i) => <span key={"pad" + i} />)}
        {days.map((d) => {
          const on = picked.includes(d.day);
          const mineWon = d.mine?.status === "WON";
          return (
            <button key={d.day} type="button" disabled={!selectable(d)} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== d.day) : [...p, d.day]))}
              title={d.status === "BIDDING" ? `Top bid ${money(d.topBidPaise!)} · ${d.bidCount} seller(s) · closes ${new Date(d.closesAt).toLocaleString("en-IN")}` : d.status === "OPEN" ? `From ${money(d.minimumBidPaise)} · bidding closes ${new Date(d.closesAt).toLocaleString("en-IN")}` : undefined}
              className={"flex min-h-[58px] flex-col items-center justify-center rounded-lg px-0.5 py-1 text-[11px] normal-case ring-1 transition sm:min-h-[68px] " + (on ? "bg-brand text-white ring-brand" : mineWon ? "bg-green-600 text-white ring-green-600" : cell[d.status])}>
              <span className="text-[13px] font-bold">{dayLabel(d.day, { day: "numeric" })}</span>
              <span className="hidden text-[10px] font-medium sm:block">{dayLabel(d.day, { month: "short" })}</span>
              <span className="mt-0.5 text-[10px] font-semibold leading-tight">
                {mineWon ? "Yours" : d.status === "BOOKED" ? "Booked" : d.status === "CLOSED" ? "Closed" : d.status === "UNAVAILABLE" ? "—" : d.status === "BIDDING" ? (d.mine?.status === "ACTIVE" ? "You lead" : money(d.topBidPaise!)) : money(d.minimumBidPaise)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        {picked.length === 0 ? <p className="text-sm text-slate-600">Tap the days you want, e.g. 3 days in a row. Each day is its own auction.</p> : (
          <>
            <p className="text-sm font-semibold">{picked.length} day{picked.length === 1 ? "" : "s"}: {[...picked].sort().map((d) => dayLabel(d, { day: "numeric", month: "short" })).join(", ")}</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-slate-600">Your bid per day (₹)
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={String(minBid / 100)} className="mt-1 block h-11 w-40 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900" />
              </label>
              <button type="button" disabled={busy || Number(amount) * 100 < minBid} onClick={() => void submit("BID")} className="h-11 rounded-full bg-chrome px-5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Placing…" : `Place bid${amount ? ` · ${money(Number(amount) * 100 * picked.length)} total` : ""}`}</button>
              {buyNow != null ? <button type="button" disabled={busy} onClick={() => void submit("BUY_NOW")} className="h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">Book now · {money(buyNow)}</button> : null}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Minimum bid {money(minBid)} per day. Highest bid when bidding closes ({slot.closeHoursBefore} h before the day starts) wins. You pay only for days you win and your ad runs, taken from your next payment.</p>
          </>
        )}
        {results.length ? (
          <ul className="mt-3 space-y-1 text-xs">
            {results.map((r) => <li key={r.day} className={r.ok ? "text-green-700" : "text-red-700"}>{dayLabel(r.day)}: {r.ok ? (r.status === "WON" ? `Booked for ${money(r.amountPaise!)}` : `You're the top bidder at ${money(r.amountPaise!)}`) : r.reason}</li>)}
          </ul>
        ) : null}
        {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}

export default function AdsView() {
  const [data, setData] = useState<Data | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/ads", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't load ads");
      setData(body);
      setSlotId((current) => current ?? body.slots[0]?.id ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't load ads"); }
  }, []);
  useEffect(() => {
    void load();
    fetch("/api/v1/products", { cache: "no-store" }).then((r) => r.json()).then((b) => setProducts(b.products ?? [])).catch(() => undefined);
  }, [load]);

  const slot = data?.slots.find((s) => s.id === slotId) ?? null;
  const campaign = useMemo(() => data?.campaigns.find((c) => c.slotId === slotId) ?? null, [data, slotId]);

  if (error) return <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!data) return <div className="mt-6 h-96 animate-pulse rounded-3xl bg-white" />;

  return (
    <div className="mt-6 space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Ad views (last 60 days)" value={data.totals.impressions.toLocaleString("en-IN")} icon="marketing" tone="brand" />
        <StatCard label="Clicks to your products" value={data.totals.clicks.toLocaleString("en-IN")} hint={data.totals.impressions ? `${((data.totals.clicks / data.totals.impressions) * 100).toFixed(1)}% click rate` : undefined} icon="sparkle" tone="good" />
        <StatCard label="Ad charges to be taken" value={money(data.totals.pendingChargesPaise)} hint="From your next payment" icon="payments" />
      </div>

      {data.slots.length === 0 ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-card">No ad spaces are on sale right now. Check back soon.</p> : (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h2 className="font-semibold">Choose an ad space</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.slots.map((s) => (
              <button key={s.id} type="button" onClick={() => { setSlotId(s.id); setEditing(false); }} className={"rounded-2xl p-4 text-left ring-1 transition " + (s.id === slotId ? "bg-orange-50 ring-2 ring-brand" : "ring-slate-200 hover:ring-slate-400")}>
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-slate-500">{s.placementLabel}</p>
                <p className="mt-2 text-sm">Bids from <b>{money(s.basePricePaise)}</b>/day{s.buyNowPricePaise ? <> · Book now <b>{money(s.buyNowPricePaise)}</b>/day</> : null}</p>
                {s.description ? <p className="mt-1 text-xs text-slate-500">{s.description}</p> : null}
              </button>
            ))}
          </div>
        </section>
      )}

      {slot ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">1</span>Your ad</h2>
            {campaign && !editing ? <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-600">Edit ad</button> : null}
          </div>
          {campaign && !editing ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <span className="aspect-[8/3] w-full shrink-0 rounded-xl bg-slate-100 bg-cover bg-center sm:w-72" style={{ backgroundImage: `url("${campaign.desktopImageUrl}")` }} />
              <div className="min-w-0">
                <p className="font-semibold">{campaign.headline}</p>
                <p className="text-xs text-slate-500">Links to: {campaign.productTitle}</p>
                <span className={"mt-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold " + AD_STATUS[campaign.status].tone}>{AD_STATUS[campaign.status].label}</span>
                {campaign.status === "REJECTED" && campaign.reviewNote ? <p className="mt-1 text-sm text-red-700">{campaign.reviewNote}</p> : null}
                {campaign.status === "PENDING_REVIEW" ? <p className="mt-1 text-xs text-slate-500">You can bid now; the ad runs only once approved.</p> : null}
              </div>
            </div>
          ) : <div className="mt-4"><AdForm key={slot.id + (campaign?.id ?? "")} slot={slot} existing={campaign} products={products} onSaved={() => { setEditing(false); void load(); }} /></div>}
        </section>
      ) : null}

      {slot && campaign && campaign.status !== "REJECTED" ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-semibold"><span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">2</span>Pick your days</h2>
          <p className="mb-3 mt-1 text-xs text-slate-500">Booked days are blocked for everyone else. Other sellers&apos; names are never shown.</p>
          <Calendar key={slot.id} slot={slot} campaign={campaign} onDone={() => void load()} />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Your bookings and bids</h2></div>
        {data.bids.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">No bids yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-2.5 font-semibold">Day</th><th className="px-3 py-2.5 font-semibold">Ad space</th><th className="px-3 py-2.5 text-right font-semibold">Your price</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-3 py-2.5 text-right font-semibold">Views</th><th className="px-5 py-2.5 text-right font-semibold">Clicks</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.bids.map((b) => (
                  <tr key={b.id}>
                    <td className="px-5 py-2.5">{dayLabel(b.day)}{b.day === data.today && b.status === "WON" ? <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">LIVE</span> : null}</td>
                    <td className="px-3 py-2.5 text-slate-600">{b.slotName}</td>
                    <td className="px-3 py-2.5 text-right">{money(b.amountPaise)}{b.kind === "BUY_NOW" ? <span className="block text-[10px] text-slate-400">booked now</span> : null}</td>
                    <td className="px-3 py-2.5"><span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + BID_STATUS[b.status].tone}>{BID_STATUS[b.status].label}</span></td>
                    <td className="px-3 py-2.5 text-right">{b.status === "WON" ? b.impressions.toLocaleString("en-IN") : "—"}</td>
                    <td className="px-5 py-2.5 text-right">{b.status === "WON" ? b.clicks.toLocaleString("en-IN") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.charges.length ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h2 className="font-semibold">Ad charges</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {data.charges.map((c) => <li key={c.id} className="flex justify-between gap-3 py-2"><span className="text-slate-600">{c.description}</span><span className="shrink-0 font-semibold">{money(c.amountPaise)} <span className="text-[11px] font-medium text-slate-400">{c.status === "PENDING" ? "next payment" : c.status === "SETTLED" ? "paid" : "waived"}</span></span></li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
