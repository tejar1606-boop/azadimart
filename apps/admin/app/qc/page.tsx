"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  productId: string;
  status: string;
  notes: string | null;
  createdAt: string;
  productTitle: string;
  sellerName: string;
  variants: Array<{ id: string; sku: string; title: string; pricePaise: number; weightGrams: number }>;
  media: Array<{ id: string; kind: string; storageKey: string; altText: string | null }>;
  aplusBlocks: unknown[];
};

export default function QCPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v1/qc", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to load QC submissions.");
      setItems(body.items ?? []);
      setSelected((current) => current && (body.items ?? []).some((item: Item) => item.id === current) ? current : body.items?.[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load QC submissions.");
    } finally {
      setLoading(false);
    }
  }

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/qc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qcSubmissionId: selected, decision, notes: notes.trim() || undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "QC decision failed.");
      setMessage(decision === "APPROVED" ? "QC passed. Product moved to final admin approval." : "QC rejected. Seller can correct and resubmit.");
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "QC decision failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const item = items.find((entry) => entry.id === selected) ?? null;

  return (
    <main className="px-4 py-6 md:px-8 md:py-10">
      <p className="text-sm uppercase tracking-wide text-ink-muted">Marketplace operations</p>
      <h1 className="mt-1 text-3xl font-semibold">Quality control</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">
        Review product media, variants and listing content before sending the product to final admin approval.
      </p>

      {error ? <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.5fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4">
            <h2 className="font-semibold">Pending QC ({items.length})</h2>
          </div>
          {loading ? (
            <p className="px-4 py-8 text-sm text-ink-muted">Loading submissions…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-sm text-ink-muted">No products are waiting for QC.</p>
          ) : (
            <div className="divide-y divide-slate-200">
              {items.map((entry) => (
                <button key={entry.id} type="button" onClick={() => { setSelected(entry.id); setNotes(entry.notes ?? ""); }} className={"block w-full px-4 py-4 text-left hover:bg-slate-50 " + (selected === entry.id ? "bg-slate-50" : "")}>
                  <p className="font-medium">{entry.productTitle}</p>
                  <p className="mt-1 text-sm text-ink-muted">{entry.sellerName}</p>
                  <p className="mt-2 text-xs text-ink-muted">{entry.variants.length} variant(s) · {entry.media.length} media item(s)</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!item ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-ink-muted">Select a product to review.</div>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-muted">Seller: {item.sellerName}</p>
                  <h2 className="mt-1 text-2xl font-semibold">{item.productTitle}</h2>
                </div>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">{item.status}</span>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold">Variants</h3>
                <div className="mt-3 space-y-2">
                  {item.variants.map((variant) => (
                    <div key={variant.id} className="rounded-lg bg-slate-50 px-3 py-3 text-sm">
                      <span className="font-medium">{variant.title}</span>
                      <span className="ml-2 text-ink-muted">{variant.sku} · ₹{(variant.pricePaise / 100).toFixed(2)} · {variant.weightGrams} g</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold">Media</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {item.media.map((media) => (
                    <a key={media.id} href={"/media/" + media.storageKey} target="_blank" rel="noreferrer" className="rounded-xl border p-3 text-sm hover:bg-slate-50">
                      {media.kind === "IMAGE" ? (
                        <span className="mb-2 block aspect-square w-full rounded-lg bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url("/media/${media.storageKey}")` }} />
                      ) : media.kind === "VIDEO" ? (
                        <video className="mb-2 block aspect-square w-full rounded-lg bg-black object-cover" src={"/media/" + media.storageKey} muted playsInline preload="metadata" />
                      ) : null}
                      <span className="font-medium">{media.kind}</span>
                      <span className="mt-1 block truncate text-xs text-ink-muted">{media.altText ?? media.storageKey}</span>
                      <span className="mt-2 block text-xs font-medium text-saffron">Open media</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold">A+ content</h3>
                <p className="mt-2 text-sm text-ink-muted">{item.aplusBlocks.length ? item.aplusBlocks.length + " content block(s) submitted." : "No A+ content submitted."}</p>
              </div>

              <div className="mt-6">
                <label className="text-sm font-medium">QC notes
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Optional reason or verification note" />
                </label>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" disabled={busy} onClick={() => void decide("APPROVED")} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Approve QC</button>
                  <button type="button" disabled={busy} onClick={() => void decide("REJECTED")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Reject QC</button>
                </div>
                <p className="mt-3 text-xs text-ink-muted">Approval moves the product to PENDING_ADMIN_APPROVAL. A second admin approval is required before it becomes LIVE.</p>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
