"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { APLUS_IMAGE_SIZES, APLUS_MAX_BLOCKS, type AplusBlock } from "@azadimart/shared";
import { AplusContent, type AplusProductSummary } from "@azadimart/ui";
import MediaSlot from "./media-slot";

type Block = AplusBlock;
type SellerProduct = { id: string; title: string; status: string; coverImageUrl: string | null; pricePaise: number | null };

const BLOCK_LABELS: Record<Block["type"], string> = {
  banner: "Full-width banner",
  image_text: "Image with text",
  features: "Feature columns",
  comparison: "Comparison table",
  text: "Text",
};

const STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Draft — not submitted", tone: "bg-slate-100 text-slate-700" },
  PENDING_REVIEW: { label: "Waiting for AzadiMart review", tone: "bg-amber-50 text-amber-800" },
  APPROVED: { label: "Approved — live on the product page", tone: "bg-green-50 text-green-700" },
  REJECTED: { label: "Changes requested", tone: "bg-red-50 text-red-700" },
};

function newBlock(type: Block["type"]): Block {
  switch (type) {
    case "banner": return { type, alt: "" };
    case "image_text": return { type, heading: "", body: "", imagePosition: "left" };
    case "features": return { type, heading: "", items: [{ title: "", text: "" }, { title: "", text: "" }, { title: "", text: "" }] };
    case "comparison": return { type, heading: "Compare similar products", productIds: [], rows: [{ label: "Price range", values: [] }] };
    case "text": return { type, heading: "", body: "" };
  }
}

const input = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500";

export default function AplusEditor({ productId }: { productId: string }) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [product, setProduct] = useState<AplusProductSummary | null>(null);
  const [catalog, setCatalog] = useState<SellerProduct[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [aplus, list] = await Promise.all([
          fetch(`/api/v1/products/${productId}/aplus`, { cache: "no-store" }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.message ?? "Could not load A+ content"); return b; }),
          fetch("/api/v1/products", { cache: "no-store" }).then((r) => r.json()),
        ]);
        setBlocks(aplus.draftBlocks ?? []);
        setProduct(aplus.product);
        setStatus(aplus.status);
        setNotes(aplus.reviewNotes);
        setCatalog((list.products ?? []).filter((item: SellerProduct) => item.id !== productId && item.status !== "ARCHIVED"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load A+ content");
      }
    })();
  }, [productId]);

  const compared = useMemo(() => Object.fromEntries(catalog.map((item) => [item.id, { id: item.id, title: item.title, imageUrl: item.coverImageUrl, pricePaise: item.pricePaise }])), [catalog]);

  function update(index: number, next: Block) { setBlocks((all) => all.map((block, i) => (i === index ? next : block))); setDirty(true); }
  function move(index: number, delta: number) {
    setBlocks((all) => { const j = index + delta; if (j < 0 || j >= all.length) return all; const copy = [...all]; [copy[index], copy[j]] = [copy[j]!, copy[index]!]; return copy; });
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/v1/products/${productId}/aplus`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks }) });
      const body = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(body?.error?.details) && body.error.details[0] ? ` (block ${Number(String(body.error.details[0].path).split(".")[1] ?? 0) + 1}: ${body.error.details[0].message})` : "";
        throw new Error((body?.error?.message ?? "Could not save") + detail);
      }
      setStatus("DRAFT"); setNotes(null); setDirty(false); setMessage("Draft saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally { setBusy(false); }
  }

  async function submit() {
    if (dirty && !(await save())) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/v1/products/${productId}/aplus/submit`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not submit");
      setStatus("PENDING_REVIEW"); setMessage("Submitted. AzadiMart will review it shortly.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
    } finally { setBusy(false); }
  }

  const statusInfo = status ? STATUS[status] : null;

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">Product</p>
              <p className="font-semibold">{product?.title ?? "…"}</p>
            </div>
            {statusInfo ? <span className={"rounded-full px-3 py-1 text-xs font-semibold " + statusInfo.tone}>{statusInfo.label}</span> : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">No A+ content yet</span>}
          </div>
          {status === "REJECTED" && notes ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"><b>Reviewer feedback:</b> {notes}</p> : null}
          {status === "APPROVED" && dirty ? <p className="mt-3 text-xs text-slate-500">Your approved version stays live until these changes are reviewed.</p> : null}
        </div>

        {blocks.map((block, index) => (
          <section key={index} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-bold">{index + 1}. {BLOCK_LABELS[block.type]}</p>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-30" aria-label="Move up">↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-30" aria-label="Move down">↓</button>
                <button type="button" onClick={() => { setBlocks((all) => all.filter((_, i) => i !== index)); setDirty(true); }} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600">Remove</button>
              </div>
            </div>
            <BlockFields block={block} onChange={(next) => update(index, next)} catalog={catalog} />
          </section>
        ))}

        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
          <p className="text-sm font-semibold">Add a block <span className="font-normal text-slate-400">({blocks.length}/{APLUS_MAX_BLOCKS})</span></p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(BLOCK_LABELS) as Block["type"][]).map((type) => (
              <button key={type} type="button" disabled={blocks.length >= APLUS_MAX_BLOCKS} onClick={() => { setBlocks((all) => [...all, newBlock(type)]); setDirty(true); }} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:border-slate-900 disabled:opacity-40">
                + {BLOCK_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold disabled:opacity-40">Save draft</button>
          <button type="button" disabled={busy || blocks.length === 0 || status === "PENDING_REVIEW" || (status === "APPROVED" && !dirty)} onClick={() => void submit()} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Submit for review</button>
          <Link href="/products" className="px-2 py-2.5 text-sm font-semibold text-slate-500">Back to products</Link>
        </div>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Live preview</p>
        <div className="max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          {blocks.length && product ? <AplusContent blocks={blocks} product={product} compared={compared} /> : <p className="py-16 text-center text-sm text-slate-400">Add blocks to see how your product page will look.</p>}
        </div>
      </div>
    </div>
  );
}

function BlockFields({ block, onChange, catalog }: { block: Block; onChange: (next: Block) => void; catalog: SellerProduct[] }) {
  switch (block.type) {
    case "banner":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <MediaSlot label="Desktop image" kind="image" size={APLUS_IMAGE_SIZES.bannerDesktop} value={block.desktopImageUrl} onChange={(url) => onChange({ ...block, desktopImageUrl: url })} />
          <MediaSlot label="Mobile image" kind="image" size={APLUS_IMAGE_SIZES.bannerMobile} value={block.mobileImageUrl} onChange={(url) => onChange({ ...block, mobileImageUrl: url })} optional />
          <MediaSlot label="Desktop video" kind="video" value={block.desktopVideoUrl} onChange={(url) => onChange({ ...block, desktopVideoUrl: url })} optional />
          <MediaSlot label="Mobile video" kind="video" value={block.mobileVideoUrl} onChange={(url) => onChange({ ...block, mobileVideoUrl: url })} optional />
          <label className="text-sm font-semibold sm:col-span-2">Describe the banner (for accessibility)<input className={input} value={block.alt} maxLength={160} onChange={(e) => onChange({ ...block, alt: e.target.value })} /></label>
        </div>
      );
    case "image_text":
      return (
        <div className="grid gap-4">
          <MediaSlot label="Image" kind="image" size={APLUS_IMAGE_SIZES.square} value={block.imageUrl} onChange={(url) => onChange({ ...block, imageUrl: url })} optional />
          {block.imageUrl ? (
            <label className="text-sm font-semibold">Image position
              <select className={input} value={block.imagePosition} onChange={(e) => onChange({ ...block, imagePosition: e.target.value as "left" | "right" })}><option value="left">Left</option><option value="right">Right</option></select>
            </label>
          ) : null}
          <label className="text-sm font-semibold">Heading<input className={input} value={block.heading} maxLength={120} onChange={(e) => onChange({ ...block, heading: e.target.value })} /></label>
          <label className="text-sm font-semibold">Text<textarea className={input + " min-h-24"} value={block.body} maxLength={1500} onChange={(e) => onChange({ ...block, body: e.target.value })} /></label>
        </div>
      );
    case "features":
      return (
        <div className="grid gap-4">
          <label className="text-sm font-semibold">Section heading (optional)<input className={input} value={block.heading} maxLength={120} onChange={(e) => onChange({ ...block, heading: e.target.value })} /></label>
          <div className="grid gap-4 sm:grid-cols-3">
            {block.items.map((item, i) => (
              <div key={i} className="space-y-2 rounded-xl bg-slate-50 p-3">
                <MediaSlot label={`Feature ${i + 1} image`} kind="image" size={APLUS_IMAGE_SIZES.square} value={item.imageUrl} onChange={(url) => onChange({ ...block, items: block.items.map((it, j) => (j === i ? { ...it, imageUrl: url } : it)) })} optional />
                <input className={input} placeholder="Title" value={item.title} maxLength={80} onChange={(e) => onChange({ ...block, items: block.items.map((it, j) => (j === i ? { ...it, title: e.target.value } : it)) })} />
                <textarea className={input + " min-h-16"} placeholder="Short description" value={item.text} maxLength={300} onChange={(e) => onChange({ ...block, items: block.items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)) })} />
              </div>
            ))}
          </div>
        </div>
      );
    case "comparison": {
      const columns = 1 + block.productIds.length;
      return (
        <div className="grid gap-4">
          <label className="text-sm font-semibold">Heading<input className={input} value={block.heading} maxLength={120} onChange={(e) => onChange({ ...block, heading: e.target.value })} /></label>
          <div className="text-sm font-semibold">Compare with (up to 3 of your products)
            <div className="mt-2 flex flex-wrap gap-2">
              {catalog.map((item) => {
                const selected = block.productIds.includes(item.id);
                return (
                  <button key={item.id} type="button" disabled={!selected && block.productIds.length >= 3} onClick={() => onChange({ ...block, productIds: selected ? block.productIds.filter((id) => id !== item.id) : [...block.productIds, item.id] })} className={"rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-40 " + (selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300")}>
                    {item.title}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="p-1">Row</th><th className="p-1">This product</th>{block.productIds.map((id) => <th key={id} className="p-1">{catalog.find((c) => c.id === id)?.title ?? "Product"}</th>)}<th /></tr></thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    <td className="p-1"><input className={input} placeholder="e.g. Weight" value={row.label} maxLength={60} onChange={(e) => onChange({ ...block, rows: block.rows.map((x, k) => (k === r ? { ...x, label: e.target.value } : x)) })} /></td>
                    {Array.from({ length: columns }, (_, c) => (
                      <td key={c} className="p-1"><input className={input} value={row.values[c] ?? ""} maxLength={80} onChange={(e) => { const values = Array.from({ length: columns }, (_, k) => (k === c ? e.target.value : row.values[k] ?? "")); onChange({ ...block, rows: block.rows.map((x, k) => (k === r ? { ...x, values } : x)) }); }} /></td>
                    ))}
                    <td className="p-1"><button type="button" disabled={block.rows.length === 1} onClick={() => onChange({ ...block, rows: block.rows.filter((_, k) => k !== r) })} className="text-xs text-red-600 disabled:opacity-30">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" disabled={block.rows.length >= 10} onClick={() => onChange({ ...block, rows: [...block.rows, { label: "", values: [] }] })} className="w-fit rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40">+ Add row</button>
        </div>
      );
    }
    case "text":
      return (
        <div className="grid gap-4">
          <label className="text-sm font-semibold">Heading (optional)<input className={input} value={block.heading} maxLength={120} onChange={(e) => onChange({ ...block, heading: e.target.value })} /></label>
          <label className="text-sm font-semibold">Text<textarea className={input + " min-h-32"} value={block.body} maxLength={3000} onChange={(e) => onChange({ ...block, body: e.target.value })} /></label>
        </div>
      );
  }
}
