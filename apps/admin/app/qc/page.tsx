"use client";

import { comparePrices, toCsv } from "@azadimart/shared";
import { useCallback, useEffect, useState } from "react";

type Changes = {
  title: string; categoryId: string; description: string | null; specifications: Array<{ label: string; value: string }>; couponMaxDiscountPct: number;
  imageAssetIds: string[]; videoAssetId: string | null;
  variant: { sku: string; title: string; pricePaise: number; compareAtPaise: number | null; weightGrams: number };
  variants?: Array<{ id?: string; sku: string; title: string; pricePaise: number; compareAtPaise: number | null; onHand?: number; attributes: Record<string, string> }>;
};
type Gst = { text: string; warning: string | null };
type Item = {
  id: string;
  kind: "NEW_LISTING" | "EDIT";
  productStatus: string;
  proposedChanges: Changes | null;
  current: { categoryId: string; description: string | null; specifications: Array<{ label: string; value: string }>; couponMaxDiscountPct: number };
  currentCategoryName: string | null;
  gstNow: Gst;
  gstRequested: Gst | null;
  proposedCategoryName: string | null;
  proposedMedia: Array<{ id: string; kind: string; storageKey: string }>;
  productId: string;
  status: string;
  notes: string | null;
  createdAt: string;
  productTitle: string;
  sellerName: string;
  variants: Array<{ id: string; sku: string; title: string; pricePaise: number; compareAtPaise: number | null; weightGrams: number; onHand: number | null; attributes: Record<string, string> }>;
  media: Array<{ id: string; kind: string; storageKey: string; altText: string | null; color: string | null }>;
  aplusBlocks: unknown[];
};

export default function QCPage() {
  const [tab, setTab] = useState<"waiting" | "history">("waiting");
  const [canSeeHistory, setCanSeeHistory] = useState(false);
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
      setCanSeeHistory(body.canSeeHistory === true);
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
      const isEdit = items.find((entry) => entry.id === selected)?.kind === "EDIT";
      setMessage(isEdit
        ? decision === "APPROVED" ? "Changes approved and now live on the product." : "Changes rejected. The live listing is unchanged and the seller was told."
        : decision === "APPROVED" ? "QC passed. Product moved to final admin approval." : "QC rejected. Seller can correct and resubmit.");
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
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <p className="text-sm uppercase tracking-wide text-ink-muted">Marketplace operations</p>
      <h1 className="mt-1 text-3xl font-semibold">Quality control</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">
        Review product media, variants and listing content before sending the product to final admin approval.
      </p>

      {canSeeHistory ? <div className="mt-5 inline-flex rounded-full border border-slate-200 bg-white p-1 text-sm font-semibold">
        {([["waiting", `Waiting for review (${items.length})`], ["history", "History: approved & rejected"]] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={"rounded-full px-4 py-2 transition " + (tab === k ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900")}>{label}</button>
        ))}
      </div> : null}

      {tab === "history" && canSeeHistory ? <QcHistory /> : <>
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
                  <p className="font-medium">{entry.kind === "EDIT" ? <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Edit request</span> : null}{entry.productTitle}</p>
                  <p className="mt-1 text-sm text-ink-muted">{entry.sellerName}</p>
                  <p className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-800">{(entry.kind === "EDIT" ? entry.proposedCategoryName : entry.currentCategoryName) ?? "No category"}</span>
                    {entry.variants[0] ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{rupees(entry.variants[0].pricePaise)}{sellerOff(entry.variants[0]) ? ` · ${sellerOff(entry.variants[0])}% off MRP` : ""}</span> : null}
                    <span className={"rounded-full px-2 py-0.5 font-semibold " + (couponPct(entry) ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500")}>{couponPct(entry) ? `Coupons up to ${couponPct(entry)}%` : "Coupons off"}</span>
                    {entry.kind === "EDIT" && entry.proposedChanges ? (() => {
                      const cmp = priceComparison(entry, entry.proposedChanges);
                      return <>
                        {cmp.changed ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900">Price change · {cmp.discountBefore}% → {cmp.discountAfter}% off</span> : null}
                        {cmp.mrpRaised ? <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">⚠ MRP raised</span> : null}
                      </>;
                    })() : null}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-muted">{entry.variants.length} variant(s) · {entry.media.length} media item(s) · sent {new Date(entry.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
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

              {item.kind === "EDIT" && item.proposedChanges ? <EditDiff item={item} changes={item.proposedChanges} /> : <ListingDetails item={item} />}

              <div className={"mt-6 " + (item.kind === "EDIT" ? "" : "hidden")}>
                <h3 className="font-semibold">Current variant (live)</h3>
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
                <h3 className="font-semibold">{item.kind === "EDIT" ? "Current media (live)" : "Media"}</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {item.media.map((media) => (
                    <a key={media.id} href={"/media/" + media.storageKey} target="_blank" rel="noreferrer" className="rounded-xl border p-3 text-sm hover:bg-slate-50">
                      {media.kind === "IMAGE" ? (
                        <span className="mb-2 block aspect-square w-full rounded-lg bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url("/media/${media.storageKey}")` }} />
                      ) : media.kind === "VIDEO" ? (
                        <video className="mb-2 block aspect-square w-full rounded-lg bg-black object-cover" src={"/media/" + media.storageKey} muted playsInline preload="metadata" />
                      ) : null}
                      <span className="font-medium">{media.kind}</span>{media.color ? <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800">{media.color}</span> : null}
                      <span className="mt-1 block truncate text-xs text-ink-muted">{media.altText ?? media.storageKey}</span>
                      <span className="mt-2 block text-xs font-medium text-saffron">Open media</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold">A+ content</h3>
                <p className="mt-2 text-sm text-ink-muted">{item.aplusBlocks.length ? <>{item.aplusBlocks.length} block(s) drafted. Review them in <a href="/aplus" className="font-medium text-saffron">A+ review</a> once the seller submits.</> : "No A+ content yet."}</p>
              </div>

              <div className="mt-6">
                <label className="text-sm font-medium">QC notes
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Optional reason or verification note" />
                </label>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" disabled={busy} onClick={() => void decide("APPROVED")} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{item.kind === "EDIT" ? "Approve changes" : "Approve QC"}</button>
                  <button type="button" disabled={busy} onClick={() => void decide("REJECTED")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{item.kind === "EDIT" ? "Reject changes" : "Reject QC"}</button>
                </div>
                <p className="mt-3 text-xs text-ink-muted">{item.kind === "EDIT"
                  ? "Approving applies the seller's changes to the product straight away; it stays " + (item.productStatus === "UNLISTED" ? "hidden" : "live") + ". Rejecting keeps the current listing; add a note so the seller knows what to fix."
                  : "Approval moves the product to PENDING_ADMIN_APPROVAL. A second admin approval is required before it becomes LIVE."}</p>
              </div>
            </>
          )}
        </section>
      </div>
      </>}
    </main>
  );
}

const rupees = (paise: number | null | undefined) => (paise == null ? "—" : "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const sellerOff = (v: { pricePaise: number; compareAtPaise: number | null }) => (v.compareAtPaise && v.compareAtPaise > v.pricePaise ? Math.round(((v.compareAtPaise - v.pricePaise) / v.compareAtPaise) * 100) : 0);
const couponPct = (item: Item) => (item.kind === "EDIT" && item.proposedChanges ? item.proposedChanges.couponMaxDiscountPct : item.current.couponMaxDiscountPct);
const variantLines = (list: Array<{ title: string; sku: string; pricePaise: number }>) => (list.length ? list.map((v) => `${v.title} · ${v.sku} · ${rupees(v.pricePaise)}`).join("\n") : "—");
/** "Red, Blue · S, M, L" from variant attributes. */
const optionSummary = (list: Array<{ attributes?: Record<string, string> }>) => {
  const colors = [...new Set(list.map((v) => v.attributes?.color).filter(Boolean))];
  const sizes = [...new Set(list.map((v) => v.attributes?.size).filter(Boolean))];
  return [colors.length ? `Colours: ${colors.join(", ")}` : "", sizes.length ? `${list.find((v) => v.attributes?.sizeLabel)?.attributes?.sizeLabel ?? "Sizes"}: ${sizes.join(", ")}` : ""].filter(Boolean).join(" · ");
};
const specText = (rows: Array<{ label: string; value: string }>) => (rows.length ? rows.map((row) => `${row.label}: ${row.value}`).join("\n") : "—");

/** Size-by-size price comparison for an edit (a single-size product keeps its variant id). */
const priceComparison = (item: Item, changes: Changes) =>
  comparePrices(item.variants, changes.variants ?? [{ ...changes.variant, id: item.variants[0]?.id }]);

/** Before → after for an edit to a live product. Changed rows are highlighted. */
function EditDiff({ item, changes }: { item: Item; changes: Changes }) {
  const before = item.variants[0];
  const rows: Array<[string, string, string]> = [
    ["Title", item.productTitle, changes.title],
    ["Category", item.currentCategoryName ?? "—", item.proposedCategoryName ?? "—"],
    ["SKU", before?.sku ?? "—", changes.variant.sku],
    ["Variant name", before?.title ?? "—", changes.variant.title],
    ["Package weight", before ? before.weightGrams + " g" : "—", changes.variant.weightGrams + " g"],
    ["Coupon limit", item.current.couponMaxDiscountPct + "%", changes.couponMaxDiscountPct + "%"],
    ["GST", item.gstNow.text, item.gstRequested?.text ?? item.gstNow.text],
    ["Colours / sizes", variantLines(item.variants), variantLines(changes.variants ?? [changes.variant])],
    ["Description", item.current.description || "—", changes.description || "—"],
    ["Specifications", specText(item.current.specifications), specText(changes.specifications)],
  ];
  const beforeMedia = item.media.map((m) => m.id).join(",");
  const mediaChanged = item.proposedMedia.map((m) => m.storageKey).join(",") !== item.media.map((m) => m.storageKey).join(",") && beforeMedia !== "";
  return (
    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
      <h3 className="font-semibold">Requested changes</h3>
      <p className="mt-1 text-xs text-ink-muted">The product stays {item.productStatus === "UNLISTED" ? "hidden" : "live"} with its current details until you decide.</p>
      <PriceTable item={item} changes={changes} />
      {item.gstRequested?.warning ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">⚠ GST: {item.gstRequested.warning}</p> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-muted"><th className="py-2 pr-3">Field</th><th className="py-2 pr-3">Now (live)</th><th className="py-2">Requested</th></tr></thead>
          <tbody>
            {rows.map(([label, now, next]) => {
              const changed = now !== next;
              return (
                <tr key={label} className={"border-t border-amber-100 align-top " + (changed ? "" : "opacity-50")}>
                  <td className="py-2 pr-3 font-medium">{label}</td>
                  <td className="whitespace-pre-line py-2 pr-3 text-ink-muted">{now}</td>
                  <td className={"whitespace-pre-line py-2 " + (changed ? "font-semibold text-amber-900" : "")}>{next}{changed ? <span className="ml-2 rounded bg-amber-200 px-1.5 text-[10px] font-bold uppercase">changed</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h4 className="mt-4 text-sm font-semibold">Requested photos &amp; video {mediaChanged ? <span className="ml-1 rounded bg-amber-200 px-1.5 text-[10px] font-bold uppercase">changed</span> : <span className="ml-1 text-xs font-normal text-ink-muted">(same as now)</span>}</h4>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {item.proposedMedia.map((media) => (
          <a key={media.id} href={"/media/" + media.storageKey} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border bg-white">
            {media.kind === "VIDEO"
              ? <video className="aspect-square w-full bg-black object-cover" src={"/media/" + media.storageKey} muted playsInline preload="metadata" />
              : <span className="block aspect-square w-full bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url("/media/${media.storageKey}")` }} />}
          </a>
        ))}
      </div>
    </div>
  );
}

/** Everything the seller filled in for a new listing: category, prices and both kinds of discount, stock and details. */
function ListingDetails({ item }: { item: Item }) {
  const pct = item.current.couponMaxDiscountPct;
  const Row = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) => (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-0.5 text-sm font-semibold">{children}</div>
      {hint ? <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p> : null}
    </div>
  );
  return (
    <div className="mt-6 space-y-5">
      <div>
        <h3 className="font-semibold">Listing details</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Row label="Category" hint="Check the product really belongs here; ask the seller to change it if not.">{item.currentCategoryName ?? <span className="text-red-700">No category</span>}</Row>
          <Row label="GST (for invoices)" hint={item.gstNow.warning ? <span className="font-semibold text-red-700">⚠ {item.gstNow.warning}</span> : "Prices include GST. Check the HSN code suits the product."}>{item.gstNow.text}</Row>
          {optionSummary(item.variants) ? <div className="sm:col-span-2"><Row label="Colours & sizes" hint="Check each colour's photos match, and that sizes suit the category.">{optionSummary(item.variants)} <span className="font-normal text-ink-muted">({item.variants.length} options)</span></Row></div> : null}
          <Row label="LOIMART coupon limit" hint={pct ? `Seller agreed that LOIMART coupons can take up to ${pct}% off; the coupon cost comes from the seller's payout.` : "Seller opted out: their payout isn't reduced by LOIMART coupons."}>
            {pct ? <span className="text-emerald-700">Up to {pct}% off</span> : "Not in LOIMART coupons"}
          </Row>
        </div>
      </div>

      <div>
        <h3 className="font-semibold">Price, discount &amp; stock</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted"><th className="py-2 pr-3">Variant</th><th className="pr-3">SKU</th><th className="pr-3 text-right">MRP</th><th className="pr-3 text-right">Selling price</th><th className="pr-3 text-right">Seller discount</th><th className="pr-3 text-right">Lowest with coupon</th><th className="pr-3 text-right">Weight</th><th className="text-right">Stock</th></tr></thead>
            <tbody>
              {item.variants.map((v) => {
                const off = sellerOff(v);
                return (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="py-2.5 pr-3 font-medium">{v.attributes?.colorHex ? <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle ring-1 ring-black/15" style={{ background: v.attributes.colorHex === "multi" ? "conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)" : v.attributes.colorHex }} /> : null}{v.title}</td>
                    <td className="pr-3 text-ink-muted">{v.sku}</td>
                    <td className="pr-3 text-right text-ink-muted">{v.compareAtPaise ? rupees(v.compareAtPaise) : "—"}</td>
                    <td className="pr-3 text-right font-semibold">{rupees(v.pricePaise)}</td>
                    <td className={"pr-3 text-right font-semibold " + (off >= 70 ? "text-red-700" : off ? "text-emerald-700" : "text-ink-muted")}>{off ? `${off}% off` : "None"}{off >= 70 ? " ⚠" : ""}</td>
                    <td className="pr-3 text-right">{pct ? rupees(v.pricePaise - Math.floor((v.pricePaise * pct) / 100)) : "—"}</td>
                    <td className="pr-3 text-right">{v.weightGrams} g</td>
                    <td className="text-right">{v.onHand ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-ink-muted">Seller discount = MRP vs selling price, set by the seller (⚠ 70% or more: check the MRP is genuine). Lowest with coupon = selling price after the biggest LOIMART coupon the seller allowed.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold">Description</h3>
          <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{item.current.description || "—"}</p>
        </div>
        <div>
          <h3 className="font-semibold">Specifications</h3>
          {item.current.specifications.length ? (
            <dl className="mt-2 max-h-60 divide-y divide-slate-200 overflow-y-auto rounded-xl bg-slate-50 px-3 text-sm">
              {item.current.specifications.map((r, i) => <div key={i} className="flex gap-3 py-2"><dt className="w-2/5 shrink-0 text-ink-muted">{r.label}</dt><dd className="font-medium">{r.value}</dd></div>)}
            </dl>
          ) : <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-ink-muted">—</p>}
        </div>
      </div>
    </div>
  );
}

type HistoryRow = { id: string; productId: string; decision: "APPROVED" | "REJECTED"; notes: string | null; submittedAt: string; decidedAt: string; isEdit: boolean; productTitle: string; productStatus: string; sellerName: string; reviewer: string | null };
const STATUS_LABEL: Record<string, string> = { LIVE: "Live", UNLISTED: "Hidden", PENDING_QC: "Back in QC", PENDING_ADMIN_APPROVAL: "Awaiting final approval", DRAFT: "Draft (seller editing)", QC_REJECTED: "Needs changes", ARCHIVED: "Archived" };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Past QC decisions: what was rejected or approved, by whom, when and why, and where the product is now. */
function QcHistory() {
  const [decision, setDecision] = useState<"REJECTED" | "APPROVED" | "">("REJECTED");
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ view: "history", decision, days: String(days), q: q.trim() });
      const response = await fetch(`/api/v1/qc?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to load QC history.");
      setRows(body.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load QC history.");
    }
  }, [decision, days, q]);
  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  function downloadCsv() {
    if (!rows) return;
    const csv = toCsv([["Decided", "Decision", "Type", "Product", "Seller", "Reviewed by", "Note to seller", "Sent for QC", "Product now"],
      ...rows.map((r) => [when(r.decidedAt), r.decision === "REJECTED" ? "Rejected" : "Approved", r.isEdit ? "Edit request" : "New listing", r.productTitle, r.sellerName, r.reviewer ?? "", r.notes ?? "", when(r.submittedAt), STATUS_LABEL[r.productStatus] ?? r.productStatus])]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `qc-history-${decision.toLowerCase() || "all"}-${days}d.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const pill = (on: boolean) => "rounded-full border px-3 py-1.5 text-xs font-semibold transition " + (on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-900");
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {([["REJECTED", "Rejected"], ["APPROVED", "Approved"], ["", "All"]] as const).map(([v, label]) => <button key={label} type="button" onClick={() => setDecision(v)} className={pill(decision === v)}>{label}</button>)}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold">
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d === 365 ? "12 months" : `${d} days`}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, seller or SKU" className="min-w-0 flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs sm:max-w-xs" />
        <button type="button" disabled={!rows?.length} onClick={downloadCsv} className="ml-auto rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:border-slate-900 disabled:opacity-40">Download CSV</button>
      </div>
      <p className="mt-3 text-[11px] text-ink-muted">🔒 Only admins see this history. QC team members see just the products waiting for review.</p>
      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {!rows ? <p className="py-8 text-sm text-ink-muted">Loading…</p> : !rows.length ? <p className="py-8 text-sm text-ink-muted">No {decision === "REJECTED" ? "rejected" : decision === "APPROVED" ? "approved" : ""} reviews in this period.</p> : (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-2 text-xs text-ink-muted">{rows.length}{rows.length === 500 ? "+ (showing the newest 500)" : ""} review{rows.length === 1 ? "" : "s"}</p>
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted"><th className="py-2 pr-3">Decided</th><th className="pr-3">Decision</th><th className="pr-3">Product</th><th className="pr-3">Seller</th><th className="pr-3">Reviewed by</th><th className="pr-3">Note to seller</th><th>Product now</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-ink-muted">{when(r.decidedAt)}</td>
                  <td className="pr-3"><span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (r.decision === "REJECTED" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700")}>{r.decision === "REJECTED" ? "Rejected" : "Approved"}</span>{r.isEdit ? <span className="mt-1 block text-[10px] text-ink-muted">Edit request</span> : null}</td>
                  <td className="max-w-[240px] pr-3"><a href={`/catalog/${r.productId}`} className="font-medium hover:underline">{r.productTitle}</a></td>
                  <td className="pr-3 text-ink-muted">{r.sellerName}</td>
                  <td className="pr-3">{r.reviewer ?? "—"}</td>
                  <td className="max-w-[280px] whitespace-pre-line pr-3 text-xs">{r.notes || <span className="text-ink-muted">No note</span>}</td>
                  <td className="text-xs">{STATUS_LABEL[r.productStatus] ?? r.productStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Prices and discount, size by size: now (live) → requested, with warnings for a raised MRP or a very big discount. */
function PriceTable({ item, changes }: { item: Item; changes: Changes }) {
  const cmp = priceComparison(item, changes);
  const pct = (n: number) => (n ? `${n}% off` : "No discount");
  return (
    <div className={"mt-3 rounded-xl border bg-white p-3 " + (cmp.mrpRaised ? "border-red-300" : cmp.changed ? "border-amber-300" : "border-slate-200")}>
      <p className="text-sm font-semibold">Prices &amp; discount {cmp.changed ? <span className="ml-1 rounded bg-amber-200 px-1.5 text-[10px] font-bold uppercase">changed</span> : <span className="ml-1 text-xs font-normal text-ink-muted">(no change)</span>}</p>
      {cmp.mrpRaised ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">⚠ The MRP was raised, making the discount look bigger. Check the new MRP is genuine (the price printed on the product / brand&apos;s price) before approving. A fake MRP misleads customers.</p> : null}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted"><th className="py-1.5 pr-3">Size / colour</th><th className="pr-3">MRP</th><th className="pr-3">Selling price</th><th>Discount</th></tr></thead>
          <tbody>
            {cmp.rows.map((r) => {
              const cell = (now: string, next: string, changed: boolean) => changed ? <><span className="text-ink-muted line-through">{now}</span> <span className="font-semibold text-amber-900">→ {next}</span></> : <span>{next}</span>;
              const b = r.before;
              return (
                <tr key={r.key} className={"border-t border-slate-100 " + (r.changed ? "" : "opacity-60")}>
                  <td className="py-2 pr-3"><span className="font-medium">{r.title}</span> <span className="text-xs text-ink-muted">{r.sku}</span>{r.isNew ? <span className="ml-1 rounded bg-sky-100 px-1.5 text-[10px] font-bold text-sky-800">NEW</span> : null}</td>
                  <td className="pr-3">{b ? cell(rupees(b.compareAtPaise), rupees(r.after.compareAtPaise), b.compareAtPaise !== r.after.compareAtPaise) : rupees(r.after.compareAtPaise)}{r.mrpRaised ? <span className="ml-1 text-xs font-bold text-red-600">⚠ raised</span> : null}</td>
                  <td className="pr-3">{b ? cell(rupees(b.pricePaise), rupees(r.after.pricePaise), b.pricePaise !== r.after.pricePaise) : rupees(r.after.pricePaise)}</td>
                  <td>{b ? cell(pct(b.discountPct), pct(r.after.discountPct), b.discountPct !== r.after.discountPct) : pct(r.after.discountPct)}{r.bigDiscount ? <span className="ml-1 text-xs font-bold text-amber-700">⚠ 70%+</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
