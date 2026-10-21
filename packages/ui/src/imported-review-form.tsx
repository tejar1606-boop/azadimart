"use client";

import { useEffect, useState } from "react";

export type ReviewProductOption = { id: string; title: string; subtitle?: string };

/**
 * "Add a review from another site": a genuine review a product earned
 * elsewhere, copied word for word, with a screenshot as proof. Used by Admin
 * (goes live at once) and Seller Centre (waits for an admin to check it).
 */
export function ImportedReviewForm({ searchProducts, proofUrl, submitUrl, needsApproval, onDone, onCancel }: {
  /** Products to choose from (search text → options). */
  searchProducts: (q: string) => Promise<ReviewProductOption[]>;
  proofUrl: string;
  submitUrl: string;
  needsApproval: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ReviewProductOption[]>([]);
  const [product, setProduct] = useState<ReviewProductOption | null>(null);
  const [form, setForm] = useState({ rating: 5, title: "", body: "", authorName: "", sourceName: "", reviewedAt: new Date().toISOString().slice(0, 10) });
  const [proof, setProof] = useState<{ id: string; preview: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (product) return;
    const timer = window.setTimeout(() => { searchProducts(query.trim()).then(setOptions).catch(() => setOptions([])); }, 250);
    return () => window.clearTimeout(timer);
  }, [query, product, searchProducts]);

  async function uploadProof(file: File) {
    setError(""); setBusy(true);
    try {
      const data = new FormData(); data.append("file", file);
      const r = await fetch(proofUrl, { method: "POST", body: data });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.message ?? "Upload failed");
      setProof({ id: b.proofAssetId, preview: URL.createObjectURL(file) });
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); }
  }

  async function submit() {
    if (!product || !proof) return;
    setError(""); setBusy(true);
    try {
      const r = await fetch(submitUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, productId: product.id, proofAssetId: proof.id }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.message ?? (b?.error?.details ? "Please check the details" : "Could not add the review"));
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add the review"); } finally { setBusy(false); }
  }

  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900";
  const ready = product && proof && confirmed && form.body.trim().length >= 10 && form.authorName.trim().length >= 2 && form.sourceName.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lift">
        <h2 id="import-title" className="text-lg font-semibold">Add a review from another site</h2>
        <p className="mt-1 text-sm text-slate-500">A genuine review this product earned elsewhere (your website, another marketplace), copied word for word. It shows on the store as <b>&ldquo;Imported from …&rdquo;</b> and doesn&apos;t change the star rating.{needsApproval ? " Our team checks the screenshot before it goes live." : ""}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="text-sm font-medium">Product</span>
            {product ? (
              <p className="mt-1 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm"><span><b>{product.title}</b>{product.subtitle ? <span className="text-slate-500"> · {product.subtitle}</span> : null}</span><button type="button" onClick={() => setProduct(null)} className="text-xs font-semibold text-slate-500 underline">Change</button></p>
            ) : (
              <>
                <input className={field} placeholder="Search your products" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
                  {options.length ? options.map((o) => <li key={o.id}><button type="button" onClick={() => setProduct(o)} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">{o.title}{o.subtitle ? <span className="text-slate-500"> · {o.subtitle}</span> : null}</button></li>) : <li className="px-3 py-2 text-sm text-slate-400">No products found</li>}
                </ul>
              </>
            )}
          </div>
          <label className="text-sm font-medium">Where it was written
            <input className={field} placeholder="e.g. Our website, Amazon, Google" maxLength={60} value={form.sourceName} onChange={(e) => setForm({ ...form, sourceName: e.target.value })} />
          </label>
          <label className="text-sm font-medium">Reviewer&apos;s name (as shown there)
            <input className={field} placeholder="e.g. Priya Sharma" maxLength={60} value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} />
          </label>
          <label className="text-sm font-medium">Star rating it was given
            <select className={field} value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}{"☆".repeat(5 - n)} ({n})</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Date it was written
            <input type="date" className={field} max={new Date().toISOString().slice(0, 10)} value={form.reviewedAt} onChange={(e) => setForm({ ...form, reviewedAt: e.target.value })} />
          </label>
          <label className="text-sm font-medium sm:col-span-2">Title (optional)
            <input className={field} maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="text-sm font-medium sm:col-span-2">Review text, word for word
            <textarea className={field + " min-h-28"} maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <div className="sm:col-span-2">
            <span className="text-sm font-medium">Screenshot of the original review (proof)</span>
            <p className="text-xs text-slate-500">Only our team sees it. It must show the review on the other site.</p>
            <div className="mt-2 flex items-center gap-3">
              {proof ? <span className="h-16 w-16 shrink-0 border border-slate-200 bg-cover bg-center" style={{ backgroundImage: `url("${proof.preview}")` }} /> : null}
              <label className="cursor-pointer rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold hover:border-slate-900">
                {proof ? "Change screenshot" : "Upload screenshot"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadProof(f); }} />
              </label>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I confirm this is a real review written by a real customer, copied without changes. Fake reviews are not allowed and are removed.</span>
          </label>
        </div>

        {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
          <button type="button" disabled={!ready || busy} onClick={() => void submit()} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : needsApproval ? "Send for approval" : "Add review"}</button>
        </div>
      </div>
    </div>
  );
}
