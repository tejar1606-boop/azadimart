"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalPageHeader, StatCard } from "@azadimart/ui";

type CartProduct = { title: string; slug: string; variantTitle: string; quantity: number; pricePaise: number; imageUrl: string | null };
type Cart = { cartId: string; customerName: string; email: string; phone: string | null; lastActivity: string; lastReminderAt: string | null; reminderCount: number; itemCount: number; valuePaise: number; products: CartProduct[] };
type Summary = { abandoned: number; valuePaise: number; reminded: number; recovered: number; recoveredPaise: number; recoveryRate: number; recoveryDays: number };
type Coupon = { code: string; title: string; isActive: boolean; endsAt: string | null };

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const ago = (iso: string) => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
};
const IDLE: Array<[string, string]> = [["1h", "Idle 1 hour+"], ["24h", "1 day+"], ["3d", "3 days+"], ["7d", "7 days+"]];

/** Builds the reminder text: first name, what's in the cart, total, link back, optional coupon. */
function reminderText(cart: Cart, storefrontUrl: string, coupon: string) {
  const first = cart.customerName.trim().split(/\s+/)[0] || "there";
  const lead = cart.products[0]?.title ?? "your items";
  const more = cart.products.length > 1 ? ` and ${cart.products.length - 1} more item${cart.products.length > 2 ? "s" : ""}` : "";
  return `Hi ${first}, you left ${lead}${more} in your AzadiMart cart (${money(cart.valuePaise)}). Your items are saved. Complete your order here: ${storefrontUrl}/cart${coupon ? `\nUse code ${coupon} at checkout for an extra discount.` : ""}\n– Team AzadiMart`;
}

export default function AbandonedCarts({ storefrontUrl }: { storefrontUrl: string }) {
  const [idle, setIdle] = useState("1h");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [coupon, setCoupon] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ idle });
      if (search) params.set("q", search);
      const response = await fetch("/api/v1/abandoned-carts?" + params, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not load carts");
      setSummary(body.summary); setCarts(body.items); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load carts"); }
    finally { setLoading(false); }
  }, [idle, search]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/v1/coupons", { cache: "no-store" }).then((r) => r.json())
      .then((b) => setCoupons((b.coupons ?? []).filter((c: Coupon) => c.isActive && (!c.endsAt || new Date(c.endsAt) > new Date()))))
      .catch(() => undefined);
  }, []);

  async function remind(cart: Cart, channel: "WHATSAPP" | "EMAIL") {
    const text = reminderText(cart, storefrontUrl, coupon);
    // Open the message first (browsers block pop-ups opened after an await).
    if (channel === "WHATSAPP") window.open(`https://wa.me/91${(cart.phone ?? "").replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    else window.location.href = `mailto:${cart.email}?subject=${encodeURIComponent("You left something in your AzadiMart cart")}&body=${encodeURIComponent(text)}`;
    await fetch(`/api/v1/abandoned-carts/${cart.cartId}/reminder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, couponCode: coupon || undefined }) });
    await load();
  }

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Sales" title="Abandoned carts" description="Signed-in customers who added products but didn't order. Send a reminder to bring them back; orders placed within 7 days of a reminder count as recovered." />

      {summary ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Abandoned carts (30 days)" value={String(summary.abandoned)} icon="orders" tone="warn" />
          <StatCard label="Value left in carts" value={money(summary.valuePaise)} icon="payments" tone="brand" />
          <StatCard label="Reminders sent (30 days)" value={String(summary.reminded)} icon="marketing" />
          <StatCard label="Recovered orders" value={`${summary.recovered} · ${money(summary.recoveredPaise)}`} hint={summary.reminded ? `${summary.recoveryRate}% of reminded carts` : "Send reminders to start recovering"} icon="finance" tone="good" />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {IDLE.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setIdle(key)} className={"rounded-full px-3.5 py-1.5 text-xs font-semibold " + (idle === key ? "bg-chrome text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900")}>{label}</button>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); }} className="ml-auto flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or phone" className="h-9 w-56 rounded-full border border-slate-300 bg-white px-3.5 text-sm outline-none focus:border-slate-900" />
          <button className="rounded-full bg-chrome px-4 text-xs font-semibold text-white">Search</button>
        </form>
      </div>
      <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Add a coupon to reminders</span>
        <select value={coupon} onChange={(e) => setCoupon(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm">
          <option value="">No coupon</option>
          {coupons.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.title}</option>)}
        </select>
      </label>
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {loading ? <p className="text-sm text-slate-500">Loading carts…</p> : carts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-card"><p className="font-semibold">No abandoned carts here.</p><p className="mt-1 text-sm text-slate-500">Carts appear once a signed-in customer leaves items for {IDLE.find((x) => x[0] === idle)?.[1].replace("Idle ", "").replace("+", "") ?? "an hour"} or more.</p></div>
        ) : carts.map((cart) => (
          <article key={cart.cartId} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{cart.customerName}</p>
                <p className="text-xs text-slate-500">{cart.email}{cart.phone ? ` · +91 ${cart.phone}` : ""}</p>
                <p className="mt-1 text-xs text-slate-500">Last active <b className="text-slate-700">{ago(cart.lastActivity)}</b>{cart.lastReminderAt ? ` · reminded ${cart.reminderCount}× (last ${ago(cart.lastReminderAt)})` : " · not reminded yet"}</p>
                <ul className="mt-3 flex flex-wrap gap-3">
                  {cart.products.map((p) => (
                    <li key={p.slug + p.variantTitle} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 pr-3 text-xs">
                      <span className="h-10 w-10 shrink-0 rounded-lg bg-slate-200 bg-cover bg-center" style={p.imageUrl ? { backgroundImage: `url("${p.imageUrl}")` } : undefined} />
                      <span><a href={`${storefrontUrl}/products/${p.slug}`} target="_blank" rel="noreferrer" className="line-clamp-1 font-semibold hover:underline">{p.title}</a><span className="text-slate-500">{p.quantity} × {money(p.pricePaise)}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                <p className="text-lg font-semibold">{money(cart.valuePaise)}</p>
                <div className="flex gap-2">
                  <button type="button" disabled={!cart.phone} title={cart.phone ? "Opens WhatsApp with a ready message" : "No phone number"} onClick={() => void remind(cart, "WHATSAPP")} className="inline-flex items-center gap-1.5 rounded-full bg-[#25d366] px-3.5 py-2 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-40">WhatsApp reminder</button>
                  <button type="button" onClick={() => void remind(cart, "EMAIL")} className="rounded-full px-3.5 py-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Email reminder</button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">Reminders open WhatsApp or your email app with a ready-written message. Only message customers who agreed to hear from AzadiMart; automatic reminders need a WhatsApp Business or email service.</p>
    </main>
  );
}
