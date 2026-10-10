"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Review = {
  id: string; rating: number; title: string | null; body: string | null; status: "PUBLISHED" | "HIDDEN"; hiddenReason: string | null;
  sellerReply: string | null; createdAt: string; productTitle: string; productSlug: string; sellerName: string;
  customerName: string; customerEmail: string; photos: string[];
};

const REASONS = ["Abusive or offensive language", "Not about the product", "Spam or advertising", "Personal or contact details", "Suspected fake review"];
const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

export default function ReviewsModeration({ storefrontUrl }: { storefrontUrl: string }) {
  const [items, setItems] = useState<Review[]>([]);
  const [status, setStatus] = useState("");
  const [rating, setRating] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [hiding, setHiding] = useState<{ review: Review; reason: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (rating) params.set("rating", rating);
    if (search) params.set("q", search);
    try {
      const response = await fetch("/api/v1/reviews?" + params, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not load reviews");
      setItems(body.items); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load reviews"); }
    finally { setLoading(false); }
  }, [status, rating, search]);
  useEffect(() => { void load(); }, [load]);

  async function moderate(review: Review, next: "PUBLISHED" | "HIDDEN", reason?: string) {
    setBusy(review.id); setError("");
    try {
      const response = await fetch(`/api/v1/reviews/${review.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next, reason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Action failed");
      setHiding(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed"); }
    finally { setBusy(null); }
  }

  const chip = (active: boolean) => "rounded-full px-3.5 py-1.5 text-xs font-semibold " + (active ? "bg-chrome text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900");

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Catalogue" title="Reviews" description="Every review is from a verified buyer and goes live straight away. Hide reviews that break the rules; the product's rating updates immediately." />
      <form onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); }} className="mt-6 flex max-w-xl gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, seller, customer or text" className="h-11 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900" />
        <button className="rounded-full bg-chrome px-5 text-sm font-semibold text-white">Search</button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {[["", "All"], ["PUBLISHED", "Live"], ["HIDDEN", "Hidden"]].map(([v, l]) => <button key={v || "all"} type="button" onClick={() => setStatus(v!)} className={chip(status === v)}>{l}</button>)}
        <span className="mx-1 w-px bg-slate-200" />
        {["", "1", "2", "3", "4", "5"].map((v) => <button key={v || "any"} type="button" onClick={() => setRating(v)} className={chip(rating === v)}>{v ? `${v} ★` : "Any rating"}</button>)}
      </div>
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-5 space-y-3">
        {loading ? <p className="text-sm text-slate-500">Loading reviews…</p> : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-card"><p className="font-semibold">No reviews here.</p></div>
        ) : items.map((r) => (
          <article key={r.id} className={"rounded-2xl border bg-white p-5 shadow-card " + (r.status === "HIDDEN" ? "border-dashed border-slate-300 opacity-75" : "border-slate-200/80")}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs text-slate-500"><a href={`${storefrontUrl}/products/${r.productSlug}#reviews`} target="_blank" rel="noreferrer" className="font-semibold text-slate-800 hover:underline">{r.productTitle}</a> · {r.sellerName}</p>
                <p className="mt-1.5"><span className="text-amber-500">{stars(r.rating)}</span>{r.title ? <span className="ml-2 text-sm font-semibold">{r.title}</span> : null}</p>
                {r.body ? <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-slate-700">{r.body}</p> : null}
                {r.photos.length ? <div className="mt-2 flex gap-2">{r.photos.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer" className="h-14 w-14 rounded-lg bg-slate-100 bg-cover bg-center ring-1 ring-slate-200" style={{ backgroundImage: `url("${src}")` }} aria-label="Open photo" />)}</div> : null}
                {r.sellerReply ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><b>Seller reply:</b> {r.sellerReply}</p> : null}
                <p className="mt-2 text-xs text-slate-400">{r.customerName} · {r.customerEmail} · {new Date(r.createdAt).toLocaleString("en-IN")}</p>
                {r.status === "HIDDEN" ? <p className="mt-2 text-xs font-semibold text-red-600">Hidden: {r.hiddenReason}</p> : null}
              </div>
              <div className="shrink-0">
                {r.status === "PUBLISHED"
                  ? <button type="button" disabled={busy === r.id} onClick={() => setHiding({ review: r, reason: REASONS[0]! })} className="rounded-full px-4 py-2 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">Hide review</button>
                  : <button type="button" disabled={busy === r.id} onClick={() => void moderate(r, "PUBLISHED")} className="rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-50">Publish again</button>}
              </div>
            </div>
          </article>
        ))}
      </div>

      {hiding ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="hide-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lift">
            <h2 id="hide-title" className="text-lg font-semibold">Hide this review?</h2>
            <p className="mt-1 text-sm text-slate-500">It disappears from the product page and no longer counts toward the rating.</p>
            <div className="mt-4 space-y-2">
              {REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-sm"><input type="radio" name="reason" checked={hiding.reason === reason} onChange={() => setHiding({ ...hiding, reason })} />{reason}</label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setHiding(null)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
              <button type="button" disabled={busy === hiding.review.id} onClick={() => void moderate(hiding.review, "HIDDEN", hiding.reason)} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Hide review</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
