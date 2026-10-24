"use client";

import { useCallback, useEffect, useState } from "react";
import { BulkReviewImport, ImportedReviewForm, PortalPageHeader, type ReviewProductOption } from "@azadimart/ui";

type Review = {
  id: string; rating: number; title: string | null; body: string | null; status: "PUBLISHED" | "HIDDEN" | "PENDING"; hiddenReason: string | null;
  sellerReply: string | null; createdAt: string; productTitle: string; productSlug: string; sellerName: string;
  customerName: string | null; customerEmail: string | null; photos: string[];
  source: "VERIFIED_PURCHASE" | "IMPORTED"; importedAuthorName: string | null; importedSourceName: string | null; importedReviewedAt: string | null;
  hasProof: boolean; proofAssetId: string | null; pinnedAt: string | null; addedByEmail: string | null; addedByRole: string | null;
};

/** Admin product search for the import form. */
const searchProducts = async (q: string): Promise<ReviewProductOption[]> => {
  const body = await fetch("/api/v1/catalog/products?" + new URLSearchParams(q ? { q } : {}), { cache: "no-store" }).then((r) => r.json());
  return ((body.items ?? []) as Array<{ id: string; title: string; sellerName: string }>).slice(0, 30).map((p) => ({ id: p.id, title: p.title, subtitle: p.sellerName }));
};

const REASONS = ["Abusive or offensive language", "Not about the product", "Spam or advertising", "Personal or contact details", "Suspected fake review"];
const IMPORT_REASONS = ["Screenshot doesn't show this review", "Can't confirm the source", "Text was changed from the original", "Not about this product", "Suspected fake review"];
const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

export default function ReviewsModeration({ storefrontUrl }: { storefrontUrl: string }) {
  const [items, setItems] = useState<Review[]>([]);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [notice, setNotice] = useState("");
  const [batchReject, setBatchReject] = useState<{ proofAssetId: string; count: number; reason: string } | null>(null);
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
    if (source) params.set("source", source);
    if (rating) params.set("rating", rating);
    if (search) params.set("q", search);
    try {
      const response = await fetch("/api/v1/reviews?" + params, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not load reviews");
      setItems(body.items); setPendingCount(body.pendingCount ?? 0); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load reviews"); }
    finally { setLoading(false); }
  }, [status, source, rating, search]);
  useEffect(() => { void load(); }, [load]);

  async function moderate(review: Review, next: "PUBLISHED" | "HIDDEN" | null, reason?: string, pinned?: boolean) {
    setBusy(review.id); setError("");
    try {
      const response = await fetch(`/api/v1/reviews/${review.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(next ? { status: next, reason } : {}), ...(pinned !== undefined ? { pinned } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Action failed");
      setHiding(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed"); }
    finally { setBusy(null); }
  }

  async function decideBatch(proofAssetId: string, decision: "APPROVE" | "REJECT", reason?: string) {
    setBusy(proofAssetId); setError("");
    try {
      const response = await fetch("/api/v1/reviews/bulk/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proofAssetId, decision, reason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Action failed");
      setBatchReject(null); setNotice(`${body.count} review${body.count === 1 ? "" : "s"} ${decision === "APPROVE" ? "approved" : "rejected"}.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed"); }
    finally { setBusy(null); }
  }
  // Waiting reviews that came in one upload share their proof file.
  const batchSize = (r: Review) => (r.status === "PENDING" && r.proofAssetId ? items.filter((x) => x.status === "PENDING" && x.proofAssetId === r.proofAssetId).length : 0);
  const firstOfBatch = (r: Review) => items.find((x) => x.status === "PENDING" && x.proofAssetId === r.proofAssetId)?.id === r.id;

  const chip = (active: boolean) => "rounded-full px-3.5 py-1.5 text-xs font-semibold " + (active ? "bg-chrome text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900");

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Catalogue" title="Reviews" description="Verified buyers' reviews go live straight away. Reviews imported from other sites show their source and never change the star rating; sellers' imports wait here for you to check the screenshot. Pin the most helpful reviews to the top."
        actions={<div className="flex flex-wrap gap-2"><button type="button" onClick={() => setBulk(true)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Bulk upload (CSV)</button><button type="button" onClick={() => setAdding(true)} className="rounded-full bg-chrome px-4 py-2 text-sm font-semibold text-white">Add review from another site</button></div>} />
      {notice ? <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p> : null}
      <form onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); }} className="mt-6 flex max-w-xl gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, seller, customer or text" className="h-11 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900" />
        <button className="rounded-full bg-chrome px-5 text-sm font-semibold text-white">Search</button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {[["", "All"], ["PENDING", `Waiting for approval${pendingCount ? ` (${pendingCount})` : ""}`], ["PUBLISHED", "Live"], ["HIDDEN", "Hidden"]].map(([v, l]) => <button key={v || "all"} type="button" onClick={() => setStatus(v!)} className={chip(status === v)}>{l}</button>)}
        <span className="mx-1 w-px bg-slate-200" />
        {[["", "All sources"], ["VERIFIED_PURCHASE", "Verified buyers"], ["IMPORTED", "Imported"]].map(([v, l]) => <button key={v || "anysrc"} type="button" onClick={() => setSource(v!)} className={chip(source === v)}>{l}</button>)}
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
                {r.source === "IMPORTED" ? (
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">Imported from {r.importedSourceName}</span>
                    <span>by {r.importedAuthorName}{r.importedReviewedAt ? ` · written ${new Date(r.importedReviewedAt).toLocaleDateString("en-IN")}` : ""}</span>
                    <span>· added by {r.addedByRole === "SELLER" ? "seller" : "admin"} {r.addedByEmail}</span>
                    {r.hasProof ? <a href={`/api/v1/reviews/${r.id}/proof`} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline">View screenshot</a> : null}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-400"><span className="font-semibold text-green-700">Verified buyer</span> · {r.customerName} · {r.customerEmail} · {new Date(r.createdAt).toLocaleString("en-IN")}</p>
                )}
                {r.pinnedAt ? <p className="mt-1 text-xs font-semibold text-brand-700">📌 Pinned to the top</p> : null}
                {r.status === "PENDING" ? <p className="mt-2 text-xs font-semibold text-amber-700">Waiting for approval: check the screenshot matches this review.</p> : null}
                {batchSize(r) > 1 && firstOfBatch(r) ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs">
                    <span className="font-semibold text-amber-900">{batchSize(r)} reviews came in this upload (same proof).</span>
                    <button type="button" disabled={busy === r.proofAssetId} onClick={() => void decideBatch(r.proofAssetId!, "APPROVE")} className="rounded-full bg-green-700 px-3 py-1 font-semibold text-white disabled:opacity-50">Approve all {batchSize(r)}</button>
                    <button type="button" disabled={busy === r.proofAssetId} onClick={() => setBatchReject({ proofAssetId: r.proofAssetId!, count: batchSize(r), reason: IMPORT_REASONS[0]! })} className="rounded-full px-3 py-1 font-semibold text-red-700 ring-1 ring-red-200 disabled:opacity-50">Reject all</button>
                  </div>
                ) : null}
                {r.status === "HIDDEN" ? <p className="mt-2 text-xs font-semibold text-red-600">Hidden: {r.hiddenReason}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                {r.status === "PENDING" ? (
                  <>
                    <button type="button" disabled={busy === r.id} onClick={() => void moderate(r, "PUBLISHED")} className="rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve</button>
                    <button type="button" disabled={busy === r.id} onClick={() => setHiding({ review: r, reason: IMPORT_REASONS[0]! })} className="rounded-full px-4 py-2 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">Reject</button>
                  </>
                ) : r.status === "PUBLISHED" ? (
                  <>
                    <button type="button" disabled={busy === r.id} onClick={() => void moderate(r, null, undefined, !r.pinnedAt)} className="rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-50">{r.pinnedAt ? "Unpin" : "Pin to top"}</button>
                    <button type="button" disabled={busy === r.id} onClick={() => setHiding({ review: r, reason: (r.source === "IMPORTED" ? IMPORT_REASONS : REASONS)[0]! })} className="rounded-full px-4 py-2 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">Hide review</button>
                  </>
                ) : <button type="button" disabled={busy === r.id} onClick={() => void moderate(r, "PUBLISHED")} className="rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-50">Publish again</button>}
              </div>
            </div>
          </article>
        ))}
      </div>

      {hiding ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="hide-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lift">
            <h2 id="hide-title" className="text-lg font-semibold">{hiding.review.status === "PENDING" ? "Reject this imported review?" : "Hide this review?"}</h2>
            <p className="mt-1 text-sm text-slate-500">{hiding.review.status === "PENDING" ? "It won't appear on the store. The seller sees your reason." : "It disappears from the product page and no longer counts toward the rating."}</p>
            <div className="mt-4 space-y-2">
              {(hiding.review.source === "IMPORTED" ? IMPORT_REASONS : REASONS).map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-sm"><input type="radio" name="reason" checked={hiding.reason === reason} onChange={() => setHiding({ ...hiding, reason })} />{reason}</label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setHiding(null)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
              <button type="button" disabled={busy === hiding.review.id} onClick={() => void moderate(hiding.review, "HIDDEN", hiding.reason)} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{hiding.review.status === "PENDING" ? "Reject" : "Hide review"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {bulk ? <BulkReviewImport proofUrl="/api/v1/reviews/proofs" bulkUrl="/api/v1/reviews/bulk" needsApproval={false} onCancel={() => setBulk(false)} onDone={(count) => { setBulk(false); setNotice(`${count} reviews imported and live.`); void load(); }} /> : null}
      {batchReject ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="batch-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lift">
            <h2 id="batch-title" className="text-lg font-semibold">Reject all {batchReject.count} reviews from this upload?</h2>
            <p className="mt-1 text-sm text-slate-500">None of them will appear on the store. The seller sees your reason.</p>
            <div className="mt-4 space-y-2">{IMPORT_REASONS.map((reason) => <label key={reason} className="flex items-center gap-2 text-sm"><input type="radio" name="batch-reason" checked={batchReject.reason === reason} onChange={() => setBatchReject({ ...batchReject, reason })} />{reason}</label>)}</div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setBatchReject(null)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
              <button type="button" disabled={busy === batchReject.proofAssetId} onClick={() => void decideBatch(batchReject.proofAssetId, "REJECT", batchReject.reason)} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Reject all</button>
            </div>
          </div>
        </div>
      ) : null}
      {adding ? <ImportedReviewForm searchProducts={searchProducts} proofUrl="/api/v1/reviews/proofs" submitUrl="/api/v1/reviews" needsApproval={false} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); void load(); }} /> : null}
    </main>
  );
}
