"use client";

import { useEffect, useMemo, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import { GST_RATES_BPS, SUGGESTED_CATEGORY_GST, formatGstRate } from "@azadimart/shared";

type Row = { id: string; name: string; slug: string; parentId: string | null; isActive: boolean; hsnCode: string | null; gstRateBps: number | null; priceLimitPaise: number | null; rateAboveLimitBps: number | null; ownHsnCount: number; liveUsingCategory: number };
type Edit = { hsnCode: string; rate: string; limit: string; above: string };

const toEdit = (r: Pick<Row, "hsnCode" | "gstRateBps" | "priceLimitPaise" | "rateAboveLimitBps">): Edit => ({
  hsnCode: r.hsnCode ?? "", rate: r.gstRateBps == null ? "" : String(r.gstRateBps),
  limit: r.priceLimitPaise == null ? "" : String(r.priceLimitPaise / 100), above: r.rateAboveLimitBps == null ? "" : String(r.rateAboveLimitBps),
});
const same = (a: Edit, b: Edit) => a.hsnCode === b.hsnCode && a.rate === b.rate && a.limit === b.limit && a.above === b.above;

/** HSN code and GST rate for each category. Products use their category's (or parent's) unless the seller gives their own. */
export default function GstTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => fetch("/api/v1/catalog/gst", { cache: "no-store" }).then((r) => r.json()).then((b) => { setRows(b.items ?? []); setEdits(Object.fromEntries((b.items ?? []).map((r: Row) => [r.id, toEdit(r)]))); });
  useEffect(() => { void load().catch(() => setMessage({ ok: false, text: "Couldn't load categories." })); }, []);

  // Top-level categories, each followed by its subcategories.
  const ordered = useMemo(() => {
    if (!rows) return [];
    const top = rows.filter((r) => !r.parentId || !rows.some((p) => p.id === r.parentId));
    return top.flatMap((t) => [t, ...rows.filter((r) => r.parentId === t.id)]);
  }, [rows]);
  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);
  const changed = (rows ?? []).filter((r) => edits[r.id] && !same(edits[r.id]!, toEdit(r)));
  const set = (id: string, patch: Partial<Edit>) => setEdits((e) => ({ ...e, [id]: { ...e[id]!, ...patch } }));
  const emptyWithSuggestion = (rows ?? []).filter((r) => !edits[r.id]?.hsnCode && SUGGESTED_CATEGORY_GST[r.slug]);

  function fillSuggestions() {
    setEdits((e) => {
      const next = { ...e };
      for (const r of emptyWithSuggestion) { const s = SUGGESTED_CATEGORY_GST[r.slug]!; next[r.id] = toEdit({ hsnCode: s.hsnCode, gstRateBps: s.gstRateBps, priceLimitPaise: s.priceLimitPaise ?? null, rateAboveLimitBps: s.rateAboveLimitBps ?? null }); }
      return next;
    });
    setMessage({ ok: true, text: `Filled ${emptyWithSuggestion.length} categories with suggestions. Check them with your CA, then press Save.` });
  }

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const items = changed.map((r) => {
        const e = edits[r.id]!;
        return { categoryId: r.id, hsnCode: e.hsnCode.trim() || null, gstRateBps: e.rate === "" ? null : Number(e.rate), priceLimitPaise: e.limit.trim() ? Math.round(Number(e.limit) * 100) : null, rateAboveLimitBps: e.above === "" ? null : Number(e.above) };
      });
      const r = await fetch("/api/v1/catalog/gst", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) {
        const d = b?.error?.details?.[0];
        const name = d?.path?.[1] !== undefined ? changed[Number(d.path[1])]?.name : null;
        throw new Error((name ? name + ": " : "") + (d?.message ?? b?.error?.message ?? "Couldn't save"));
      }
      await load();
      setMessage({ ok: true, text: `Saved ${items.length} ${items.length === 1 ? "category" : "categories"}. New orders use these rates; past orders and invoices keep theirs.` });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't save" }); }
    finally { setBusy(false); }
  }

  const field = "w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-slate-900";
  const rateSelect = (value: string, onChange: (v: string) => void, label: string, placeholder = "—") => (
    <select aria-label={label} className={field} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {GST_RATES_BPS.map((b) => <option key={b} value={b}>{formatGstRate(b)}</option>)}
    </select>
  );

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Catalogue" title="GST & HSN" description="The HSN code and GST rate for each category. Products use their category's (a subcategory left empty uses its parent's) unless the seller gives a product its own, which QC checks. Prices include GST; invoices split the tax out." />
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <b>Have your CA confirm every rate.</b> Since 22 September 2025 the main GST rates are 5% and 18% (40% for luxury and &ldquo;sin&rdquo; goods). Clothing, footwear and textile made-ups are 5% up to ₹2,500 a piece and 18% above. Set that as a price rule: rate 5%, &ldquo;above ₹2,500&rdquo; 18%.
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {emptyWithSuggestion.length ? <button type="button" onClick={fillSuggestions} className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Fill {emptyWithSuggestion.length} empty with suggestions</button> : null}
        <button type="button" disabled={busy || !changed.length} onClick={() => void save()} className="rounded-full bg-chrome px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : changed.length ? `Save ${changed.length} ${changed.length === 1 ? "change" : "changes"}` : "Saved"}</button>
        {changed.length ? <button type="button" onClick={() => setEdits(Object.fromEntries((rows ?? []).map((r) => [r.id, toEdit(r)])))} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Undo changes</button> : null}
      </div>
      {message ? <p className={"mt-3 rounded-lg px-3 py-2 text-sm " + (message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{message.text}</p> : null}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {!rows ? <p className="p-6 text-sm text-ink-muted">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-ink-muted"><th className="px-4 py-2.5">Category</th><th className="w-32 pr-3">HSN code</th><th className="w-28 pr-3">GST rate</th><th className="w-36 pr-3">Higher rate above (₹ / piece)</th><th className="w-28 pr-3">…then</th><th className="pr-4">Products</th></tr></thead>
              <tbody>
                {ordered.map((r) => {
                  const e = edits[r.id] ?? toEdit(r);
                  const parent = r.parentId ? byId.get(r.parentId) : undefined;
                  const inherits = parent && !e.hsnCode && parent.hsnCode;
                  const suggestion = SUGGESTED_CATEGORY_GST[r.slug];
                  const dirty = !same(e, toEdit(r));
                  return (
                    <tr key={r.id} className={"border-t border-slate-100 align-top " + (dirty ? "bg-sky-50/60" : "")}>
                      <td className={"py-2.5 pr-3 " + (parent ? "pl-9" : "px-4")}>
                        <span className={parent ? "" : "font-semibold"}>{r.name}</span>{!r.isActive ? <span className="ml-1 text-xs text-ink-muted">(hidden)</span> : null}
                        {inherits ? <span className="block text-xs text-ink-muted">Uses {parent.name}: HSN {parent.hsnCode} · {formatGstRate(parent.gstRateBps ?? 0)}</span> : null}
                        {suggestion && !e.hsnCode ? <span className="block text-xs text-ink-muted">Suggested: {suggestion.hsnCode} · {formatGstRate(suggestion.gstRateBps!)} ({suggestion.note})</span> : null}
                      </td>
                      <td className="py-2 pr-3"><input aria-label={`${r.name} HSN code`} className={field + " font-mono"} inputMode="numeric" maxLength={8} value={e.hsnCode} onChange={(ev) => set(r.id, { hsnCode: ev.target.value.replace(/\D/g, "") })} placeholder={inherits ? parent.hsnCode ?? "" : "e.g. 6204"} /></td>
                      <td className="py-2 pr-3">{rateSelect(e.rate, (v) => set(r.id, { rate: v }), `${r.name} GST rate`)}</td>
                      <td className="py-2 pr-3"><input aria-label={`${r.name} price limit`} className={field} inputMode="decimal" value={e.limit} onChange={(ev) => set(r.id, { limit: ev.target.value.replace(/[^\d.]/g, "") })} placeholder="No price rule" /></td>
                      <td className="py-2 pr-3">{rateSelect(e.above, (v) => set(r.id, { above: v }), `${r.name} rate above limit`)}</td>
                      <td className="py-2.5 pr-4 text-xs text-ink-muted">{r.liveUsingCategory} live{r.ownHsnCount ? <span className="block">{r.ownHsnCount} with seller&apos;s own HSN</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
