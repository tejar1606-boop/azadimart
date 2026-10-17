"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Review = { id: string; rating: number; title: string | null; body: string | null; createdAt: string; sellerReply: string | null; sellerRepliedAt: string | null; productTitle: string; productSlug: string; authorName: string; photos: string[] };
const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

export default function SellerReviewsPage() {
  const [items, setItems] = useState<Review[]>([]);
  const [summary, setSummary] = useState({ count: 0, average: 0 });
  const [rating, setRating] = useState("");
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetch("/api/v1/reviews" + (rating ? `?rating=${rating}` : ""), { cache: "no-store" }).then((r) => r.json());
      setItems(body.items ?? []); setSummary(body.summary ?? { count: 0, average: 0 });
    } finally { setLoading(false); }
  }, [rating]);
  useEffect(() => { void load(); }, [load]);

  async function saveReply(review: Review, reply: string) {
    setBusy(review.id); setError("");
    try {
      const response = await fetch(`/api/v1/reviews/${review.id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reply }) });
      const body = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(body?.error?.details) && body.error.details[0] ? body.error.details[0].message : "";
        throw new Error(detail || body?.error?.message || "Could not save the reply");
      }
      setEditing(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the reply"); }
    finally { setBusy(null); }
  }

  const chip = (active: boolean) => "rounded-full px-3.5 py-1.5 text-xs font-semibold " + (active ? "bg-chrome text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900");

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Catalogue" title="Customer reviews" description="Reviews from verified buyers of your products. A polite, helpful reply builds trust with future customers." />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Average rating</p><p className="mt-1 text-3xl font-semibold">{summary.count ? summary.average.toFixed(1) : "—"} <span className="text-xl text-amber-500">★</span></p></div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Reviews</p><p className="mt-1 text-3xl font-semibold">{summary.count}</p></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {["", "5", "4", "3", "2", "1"].map((v) => <button key={v || "all"} type="button" onClick={() => setRating(v)} className={chip(rating === v)}>{v ? `${v} ★` : "All"}</button>)}
      </div>
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 space-y-3">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-card"><p className="font-semibold">No reviews yet.</p><p className="mt-1 text-sm text-slate-500">Customers can review your products after delivery.</p></div>
        ) : items.map((r) => {
          const isEditing = editing === r.id;
          return (
            <article key={r.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <p className="text-xs font-semibold text-slate-500">{r.productTitle}</p>
              <p className="mt-1.5"><span className="text-amber-500">{stars(r.rating)}</span>{r.title ? <span className="ml-2 text-sm font-semibold">{r.title}</span> : null}</p>
              {r.body ? <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-slate-700">{r.body}</p> : null}
              {r.photos.length ? <div className="mt-2 flex gap-2">{r.photos.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer" className="h-14 w-14 rounded-lg bg-slate-100 bg-cover bg-center ring-1 ring-slate-200" style={{ backgroundImage: `url("${src}")` }} aria-label="Open photo" />)}</div> : null}
              <p className="mt-2 text-xs text-slate-400">{r.authorName} · Verified buyer · {new Date(r.createdAt).toLocaleDateString("en-IN")}</p>
              {isEditing ? (
                <div className="mt-3">
                  <textarea value={drafts[r.id] ?? r.sellerReply ?? ""} maxLength={1000} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} placeholder="Thank the customer, or explain how you'll make it right." className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900" />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy === r.id} onClick={() => void saveReply(r, (drafts[r.id] ?? r.sellerReply ?? "").trim())} className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy === r.id ? "Saving…" : "Post reply"}</button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-slate-300">Cancel</button>
                    {r.sellerReply ? <button type="button" disabled={busy === r.id} onClick={() => void saveReply(r, "")} className="ml-auto text-xs font-semibold text-red-600">Remove reply</button> : null}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Your reply is public on the product page. Don&apos;t share phone numbers or links.</p>
                </div>
              ) : r.sellerReply ? (
                <div className="mt-3 rounded-xl border-l-4 border-brand bg-brand-50/60 px-4 py-3">
                  <p className="text-xs font-semibold text-brand-700">Your reply</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{r.sellerReply}</p>
                  <button type="button" onClick={() => setEditing(r.id)} className="mt-2 text-xs font-semibold text-slate-600 hover:text-slate-900">Edit reply</button>
                </div>
              ) : (
                <button type="button" onClick={() => setEditing(r.id)} className="mt-3 rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Reply</button>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
