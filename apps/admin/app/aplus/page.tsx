"use client";

import { useEffect, useState } from "react";
import type { AplusBlock } from "@azadimart/shared";
import { AplusContent, type AplusProductSummary } from "@azadimart/ui";

type Item = { productId: string; draftBlocks: AplusBlock[]; submittedAt: string | null; productTitle: string; productStatus: string; sellerName: string; hasPublishedVersion: boolean };
type Summary = { id: string; title: string; imageUrl: string | null; pricePaise: number | null; slug: string; status: string };

export default function AplusReviewPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/v1/aplus", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? "Could not load A+ submissions");
    setItems(body.items);
    setSummaries(body.summaries);
    setSelected((current) => (body.items.some((item: Item) => item.productId === current) ? current : body.items[0]?.productId ?? null));
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  const item = items.find((entry) => entry.productId === selected);
  const product: AplusProductSummary | null = item ? (summaries[item.productId] ?? { id: item.productId, title: item.productTitle, imageUrl: null, pricePaise: null }) : null;
  const compared = Object.fromEntries(Object.values(summaries).map((summary) => [summary.id, summary]));

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!item) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/v1/aplus/${item.productId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, notes: notes.trim() || undefined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Decision failed");
      setMessage(decision === "APPROVED" ? `Approved — A+ content for "${item.productTitle}" is now live.` : `Changes requested for "${item.productTitle}".`);
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed");
    } finally { setBusy(false); }
  }

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <p className="text-sm uppercase tracking-wide text-ink-muted">Marketplace operations</p>
      <h1 className="mt-2 text-3xl font-semibold">A+ content review</h1>
      <p className="mt-2 text-sm text-ink-muted">Check seller A+ content before it appears on product pages. Approved content replaces the live version.</p>
      {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p> : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="h-fit rounded-2xl border bg-white">
          <h2 className="border-b px-4 py-3 font-semibold">Waiting for review ({items.length})</h2>
          {items.length === 0 ? <p className="p-4 text-sm text-ink-muted">Nothing to review.</p> : items.map((entry) => (
            <button key={entry.productId} type="button" onClick={() => setSelected(entry.productId)} className={"block w-full border-b px-4 py-3 text-left last:border-0 " + (entry.productId === selected ? "bg-slate-50" : "hover:bg-slate-50")}>
              <span className="block font-medium">{entry.productTitle}</span>
              <span className="block text-sm text-ink-muted">{entry.sellerName}</span>
              <span className="mt-1 block text-xs text-ink-muted">{entry.draftBlocks.length} block(s){entry.hasPublishedVersion ? " · update to live content" : " · first version"}</span>
            </button>
          ))}
        </section>
        {item && product ? (
          <section className="rounded-2xl border bg-white p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-ink-muted">Seller: {item.sellerName} · Product status: {item.productStatus}</p>
                <h2 className="text-xl font-semibold">{item.productTitle}</h2>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Pending review</span>
            </div>
            <div className="mt-6 rounded-2xl border border-dashed p-5">
              <AplusContent blocks={item.draftBlocks} product={product} compared={compared} />
            </div>
            <label className="mt-6 block text-sm font-medium">Notes to the seller (required to request changes)
              <textarea className="mt-2 min-h-24 w-full rounded-xl border p-3 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. The banner text is unreadable on mobile; please upload a clearer image." />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => void decide("APPROVED")} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Approve &amp; publish</button>
              <button type="button" disabled={busy || !notes.trim()} onClick={() => void decide("REJECTED")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Request changes</button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
