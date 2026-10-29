"use client";

import {
  BULK_PRODUCT_COLUMNS, BULK_PRODUCT_LIMITS, COUPON_DISCOUNT_CHOICES, PRODUCT_MEDIA_LIMITS,
  mapBulkHeaders, parseCsv, photoKey, readBulkRow, toCsv,
  type BulkCategory, type BulkProductDraft, type BulkProductKey,
} from "@azadimart/shared";
import { directUpload, readImageSize } from "@azadimart/ui";
import { useEffect, useMemo, useRef, useState } from "react";

type Row = { line: number; cells: Record<BulkProductKey, string>; draft?: BulkProductDraft; errors: string[]; result?: { ok: boolean; error?: string; status?: string } };
type Photo = { name: string; state: "uploading" | "done" | "error"; assetId?: string; url?: string; error?: string };

const card = "mt-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7";
const primary = "rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-40";
const secondary = "rounded-full border border-slate-300 px-4 py-2.5 text-xs font-bold hover:border-slate-900 disabled:opacity-40";
const PHOTO_CONCURRENCY = 3;
const MIN_PHOTO_PX = 500;

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFileText(file: File): Promise<string> {
  if (/\.(xlsx|xls|numbers)$/i.test(file.name)) return Promise.reject(new Error("This is an Excel file. In Excel choose File → Save As → \"CSV UTF-8 (Comma delimited)\", or in Google Sheets File → Download → CSV, then upload that file."));
  if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error("The sheet is bigger than 5 MB. Split it into smaller files."));
  return file.text();
}

export default function BulkUpload() {
  const [tab, setTab] = useState<"add" | "stock">("add");
  return (
    <>
      <div className="mt-6 inline-flex rounded-full border border-slate-200 bg-white p-1 text-sm font-bold">
        {([["add", "Add new products"], ["stock", "Update stock"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={"rounded-full px-4 py-2 transition " + (tab === k ? "bg-slate-950 text-white" : "text-slate-600 hover:text-slate-950")}>{label}</button>
        ))}
      </div>
      {tab === "add" ? <AddProducts /> : <UpdateStock />}
    </>
  );
}

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className={card}>
      <div className="flex items-center gap-3">
        <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black " + (done ? "bg-emerald-600 text-white" : "bg-slate-950 text-white")}>{done ? "✓" : n}</span>
        <h2 className="text-lg font-black tracking-[-0.02em]">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function AddProducts() {
  const [categories, setCategories] = useState<BulkCategory[]>([]);
  const [catQuery, setCatQuery] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [sheetError, setSheetError] = useState("");
  const [photos, setPhotos] = useState<Record<string, Photo>>({});
  const [photoNote, setPhotoNote] = useState("");
  const [submitForQc, setSubmitForQc] = useState(false);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [createError, setCreateError] = useState("");
  const sheetInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch("/api/v1/categories", { cache: "no-store" }).then((r) => r.json()).then((d) => setCategories(d.items ?? [])).catch(() => setSheetError("Couldn't load the category list. Refresh the page."));
  }, []);

  function downloadTemplate() {
    const example = categories[0];
    download("loimart-bulk-products-template.csv", toCsv([
      BULK_PRODUCT_COLUMNS.map((c) => c.header),
      ["TSHIRT-RED-M", "Men's red cotton T-shirt", example?.name ?? "", "Soft 100% cotton T-shirt for everyday wear.", "Material: Cotton | Fit: Regular | Wash: Machine wash", "499", "999", "250", "25", "Red / M", "10", "tshirt-red-1.jpg | tshirt-red-2.jpg"],
    ]));
  }

  async function onSheet(file: File) {
    setSheetError(""); setRows([]); setCreateError(""); setSheetName(file.name);
    try {
      const table = parseCsv(await readFileText(file));
      if (table.length < 2) throw new Error("The sheet has no product rows. Fill in the template from row 2.");
      const { columns, missing } = mapBulkHeaders(table[0]!);
      if (missing.length) throw new Error(`These columns are missing: ${missing.join(", ")}. Start from the template and keep its first row.`);
      const body = table.slice(1);
      if (body.length > BULK_PRODUCT_LIMITS.maxRows) throw new Error(`Up to ${BULK_PRODUCT_LIMITS.maxRows} products per file. This one has ${body.length}; split it into smaller files.`);
      const parsed = body.map((cellsArr, i) => {
        const cells = Object.fromEntries(BULK_PRODUCT_COLUMNS.map((c) => [c.key, ""])) as Record<BulkProductKey, string>;
        columns.forEach((key, col) => { if (key) cells[key] = cellsArr[col] ?? ""; });
        const { draft, errors } = readBulkRow(cells, categories);
        return { line: i + 2, cells, draft, errors };
      });
      // The same SKU twice in one sheet can only be saved once.
      const counts = new Map<string, number>();
      parsed.forEach((r) => r.draft && counts.set(r.draft.sku, (counts.get(r.draft.sku) ?? 0) + 1));
      parsed.forEach((r) => { if (r.draft && counts.get(r.draft.sku)! > 1) { r.errors.push(`SKU ${r.draft.sku} is used on more than one row`); r.draft = undefined; } });
      setRows(parsed);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : "Couldn't read this file.");
    } finally {
      if (sheetInput.current) sheetInput.current.value = "";
    }
  }

  const needed = useMemo(() => [...new Set(rows.flatMap((r) => r.draft?.photos ?? []))], [rows]);
  const missingPhotos = needed.filter((p) => photos[p]?.state !== "done");

  async function onPhotos(files: File[]) {
    setPhotoNote("");
    const wanted = new Set(needed);
    const matched = files.filter((f) => wanted.has(photoKey(f.name)) && photos[photoKey(f.name)]?.state !== "done");
    const ignored = files.length - matched.length;
    if (!matched.length) {
      setPhotoNote(needed.length ? "None of these file names are in your sheet's \"Photo file names\" column." : "Upload your filled sheet first, so we know which photos go with which product.");
      return;
    }
    if (ignored) setPhotoNote(`${ignored} file${ignored === 1 ? "" : "s"} skipped: not in the sheet, or already uploaded.`);
    setPhotos((p) => ({ ...p, ...Object.fromEntries(matched.map((f) => [photoKey(f.name), { name: f.name, state: "uploading" as const }])) }));
    const queue = [...matched];
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const key = photoKey(file.name);
        try {
          const size = await readImageSize(file);
          if (Math.abs(size.width - size.height) / Math.max(size.width, size.height) > 0.02) throw new Error(`Not square (${size.width} × ${size.height}). Use 1000 × 1000 px.`);
          if (size.width < MIN_PHOTO_PX) throw new Error(`Too small (${size.width} px). Use 1000 × 1000 px.`);
          const res = await directUpload(file, { purpose: "PRODUCT_IMAGE" });
          setPhotos((p) => ({ ...p, [key]: { name: file.name, state: "done", assetId: res.mediaAssetId, url: res.url } }));
        } catch (err) {
          setPhotos((p) => ({ ...p, [key]: { name: file.name, state: "error", error: err instanceof Error ? err.message : "Upload failed" } }));
        }
      }
    };
    await Promise.all(Array.from({ length: PHOTO_CONCURRENCY }, worker));
  }

  const pending = rows.filter((r) => r.draft && !r.result?.ok);
  const readyRows = pending.filter((r) => r.draft!.photos.every((p) => photos[p]?.state === "done"));
  const uploading = Object.values(photos).some((p) => p.state === "uploading");
  const created = rows.filter((r) => r.result?.ok).length;
  const failedOnSave = rows.filter((r) => r.result && !r.result.ok).length;

  async function createAll() {
    setCreating(true); setCreateError("");
    const todo = readyRows.slice();
    setProgress({ done: 0, total: todo.length });
    try {
      for (let i = 0; i < todo.length; i += BULK_PRODUCT_LIMITS.batchSize) {
        const batch = todo.slice(i, i + BULK_PRODUCT_LIMITS.batchSize);
        const res = await fetch("/api/v1/products/bulk", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submitForQc,
            rows: batch.map((r) => {
              const d = r.draft!;
              return { row: r.line, product: {
                title: d.title, categoryId: d.categoryId, description: d.description, specifications: d.specifications, couponMaxDiscountPct: d.couponMaxDiscountPct,
                imageAssetIds: d.photos.map((p) => photos[p]!.assetId!),
                variant: { sku: d.sku, title: d.variantTitle, pricePaise: d.pricePaise, compareAtPaise: d.compareAtPaise, weightGrams: d.weightGrams, onHand: d.onHand },
              } };
            }),
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't save the products. Try again; rows already saved won't be added twice.");
        const byLine = new Map<number, { ok: boolean; error?: string; status?: string }>((json.results ?? []).map((r: { row: number; ok: boolean; error?: string; status?: string }) => [r.row, r]));
        setRows((prev) => prev.map((r) => (byLine.has(r.line) ? { ...r, result: byLine.get(r.line) } : r)));
        setProgress({ done: Math.min(todo.length, i + batch.length), total: todo.length });
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't save the products.");
    } finally {
      setCreating(false);
    }
  }

  /** Rows that still need fixing, with a Problem column, ready to correct and upload again. */
  function downloadProblems() {
    const bad = rows.filter((r) => !r.result?.ok && (r.errors.length || r.result || r.draft?.photos.some((p) => photos[p]?.state !== "done")));
    download("loimart-rows-to-fix.csv", toCsv([
      [...BULK_PRODUCT_COLUMNS.map((c) => c.header), "Problem"],
      ...bad.map((r) => [...BULK_PRODUCT_COLUMNS.map((c) => r.cells[c.key]), rowProblem(r, photos)]),
    ]));
  }

  const filteredCats = categories.filter((c) => c.name.toLowerCase().includes(catQuery.toLowerCase()));
  const withErrors = rows.filter((r) => r.errors.length).length;

  return (
    <>
      <Step n={1} title="Download the template and fill it in">
        <p className="text-sm text-slate-600">One row per product. Open it in Excel or Google Sheets, keep the first row as it is, and save as <b>CSV</b>. Columns with * are required.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={downloadTemplate} className={primary}>Download template</button>
          <button type="button" disabled={!categories.length} onClick={() => download("loimart-categories.csv", toCsv([["Category", "Code"], ...categories.map((c) => [c.name, c.slug])]))} className={secondary + " py-3"}>Download category list</button>
        </div>
        <details className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm">
          <summary className="cursor-pointer font-bold">How to fill each column</summary>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {BULK_PRODUCT_COLUMNS.map((c) => <div key={c.key} className="rounded-xl bg-white p-3"><dt className="text-xs font-black">{c.header}</dt><dd className="mt-0.5 text-xs leading-5 text-slate-500">{c.help}</dd></div>)}
          </dl>
          <p className="mt-3 text-xs leading-5 text-slate-500">Photos: square JPG, PNG or WebP, 1000 × 1000 px or larger, up to {PRODUCT_MEDIA_LIMITS.maxImages} per product. Write each photo&apos;s file name in the sheet exactly as it is on your computer. Coupon limit choices: {COUPON_DISCOUNT_CHOICES.join(", ")}.</p>
        </details>
        <details className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <summary className="cursor-pointer font-bold">Category list ({categories.length})</summary>
          <input value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder="Search categories" className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:max-w-xs" />
          <ul className="mt-3 flex max-h-60 flex-wrap gap-1.5 overflow-y-auto">
            {filteredCats.map((c) => (
              <li key={c.id}><button type="button" title="Copy" onClick={() => void navigator.clipboard?.writeText(c.name)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold hover:border-slate-900">{c.name}</button></li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">Tap a category to copy its name.</p>
        </details>
      </Step>

      <Step n={2} title="Upload your filled sheet" done={rows.length > 0 && !withErrors}>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-slate-900"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void onSheet(f); }}>
          <span className="text-sm font-bold">{sheetName ? `Loaded: ${sheetName}` : "Choose your CSV file or drop it here"}</span>
          <span className="mt-1 text-xs text-slate-500">Up to {BULK_PRODUCT_LIMITS.maxRows} products per file. Choose it again after making changes.</span>
          <input ref={sheetInput} type="file" accept=".csv,text/csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onSheet(f); }} />
        </label>
        {sheetError ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sheetError}</p> : null}
        {rows.length ? (
          <p className="mt-3 text-sm"><b>{rows.length}</b> products found · <span className="text-emerald-700">{rows.length - withErrors} look good</span>{withErrors ? <> · <span className="font-semibold text-red-700">{withErrors} need fixing</span> (see the table below; fix them in your sheet and upload it again, or carry on without them)</> : null}</p>
        ) : null}
      </Step>

      <Step n={3} title="Add the photos" done={needed.length > 0 && !missingPhotos.length}>
        <p className="text-sm text-slate-600">Select all the photos named in your sheet at once (Ctrl/Cmd + A in the folder). We match them by file name.</p>
        <label className={"mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center " + (needed.length ? "border-slate-300 hover:border-slate-900" : "cursor-not-allowed border-slate-200 opacity-60")}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (needed.length) void onPhotos([...e.dataTransfer.files]); }}>
          <span className="text-sm font-bold">Choose photos or drop them here</span>
          <span className="mt-1 text-xs text-slate-500">Square JPG, PNG or WebP · 1000 × 1000 px or larger</span>
          <input ref={photoInput} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={!needed.length} className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void onPhotos(f); }} />
        </label>
        {needed.length ? (
          <div className="mt-3 text-sm">
            <p><b>{needed.length - missingPhotos.length}</b> of <b>{needed.length}</b> photos uploaded{uploading ? " · uploading…" : ""}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${((needed.length - missingPhotos.length) / needed.length) * 100}%` }} /></div>
            {missingPhotos.length && !uploading ? (
              <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Still needed ({missingPhotos.length})</summary>
                <ul className="mt-2 flex flex-wrap gap-1.5">{missingPhotos.map((p) => <li key={p} className={"rounded-full px-2.5 py-1 text-[11px] " + (photos[p]?.state === "error" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>{p}{photos[p]?.error ? ` · ${photos[p]!.error}` : ""}</li>)}</ul>
              </details>
            ) : null}
          </div>
        ) : null}
        {photoNote ? <p className="mt-2 text-xs text-amber-700">{photoNote}</p> : null}
      </Step>

      <Step n={4} title="Create the products" done={rows.length > 0 && created === rows.length}>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          {([[false, "Save as drafts", "Check them in Your products, then send to QC yourself."], [true, "Send to QC straight away", "LOIMART checks them; they go live once approved."]] as const).map(([v, label, hint]) => (
            <label key={String(v)} className={"flex cursor-pointer gap-3 rounded-2xl border p-4 " + (submitForQc === v ? "border-slate-950 bg-slate-50" : "border-slate-200")}>
              <input type="radio" name="bulk-mode" checked={submitForQc === v} onChange={() => setSubmitForQc(v)} className="mt-1" />
              <span><span className="block text-sm font-bold">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" disabled={!readyRows.length || creating || uploading} onClick={() => void createAll()} className={primary}>
            {creating ? `Saving ${progress.done} of ${progress.total}…` : readyRows.length ? `Create ${readyRows.length} product${readyRows.length === 1 ? "" : "s"}` : "Create products"}
          </button>
          {rows.length && pending.length > readyRows.length ? <span className="text-xs text-slate-500">{pending.length - readyRows.length} waiting for photos</span> : null}
          {rows.some((r) => !r.result?.ok) && rows.length ? <button type="button" onClick={downloadProblems} className={secondary}>Download rows to fix</button> : null}
        </div>
        {creating ? <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-slate-950 transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div> : null}
        {createError ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{createError}</p> : null}
        {created ? (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            <b>{created} product{created === 1 ? "" : "s"} created</b>{submitForQc ? " and sent to QC" : " as drafts"}.{failedOnSave ? ` ${failedOnSave} couldn't be saved; see the table.` : ""} <a href="/products" className="font-bold underline">Go to Your products</a>
          </p>
        ) : null}
      </Step>

      {rows.length ? <RowsTable rows={rows} photos={photos} /> : null}
    </>
  );
}

function rowProblem(r: Row, photos: Record<string, Photo>): string {
  if (r.result && !r.result.ok) return r.result.error ?? "Couldn't save";
  if (r.errors.length) return r.errors.join("; ");
  const missing = (r.draft?.photos ?? []).filter((p) => photos[p]?.state !== "done");
  if (missing.length) return "Photo not uploaded: " + missing.map((p) => photos[p]?.error ? `${p} (${photos[p]!.error})` : p).join(", ");
  return "";
}

function RowsTable({ rows, photos }: { rows: Row[]; photos: Record<string, Photo> }) {
  const [only, setOnly] = useState(false);
  const shown = rows.filter((r) => !only || rowProblem(r, photos));
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black tracking-[-0.02em]">Your products</h2>
        <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Show only rows with problems</label>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-slate-400">
            <tr><th className="py-2 pr-3">Row</th><th className="pr-3">Photo</th><th className="pr-3">Product</th><th className="pr-3">SKU</th><th className="pr-3">Price</th><th className="pr-3">Stock</th><th>Status</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const problem = rowProblem(r, photos);
              const cover = r.draft?.photos[0] ? photos[r.draft.photos[0]]?.url : undefined;
              return (
                <tr key={r.line} className="border-t border-slate-100 align-top">
                  <td className="py-2.5 pr-3 text-xs text-slate-400">{r.line}</td>
                  <td className="pr-3">{cover ? <img src={cover} alt="" className="h-10 w-10 rounded-lg object-cover" /> /* eslint-disable-line @next/next/no-img-element */ : <span className="block h-10 w-10 rounded-lg bg-slate-100" />}</td>
                  <td className="max-w-[240px] pr-3"><p className="line-clamp-2 font-semibold">{r.cells.title || "—"}</p><p className="text-xs text-slate-400">{r.cells.category}</p></td>
                  <td className="pr-3 text-xs">{r.cells.sku}</td>
                  <td className="pr-3 text-xs">{r.draft ? "₹" + (r.draft.pricePaise / 100).toLocaleString("en-IN") : r.cells.price}</td>
                  <td className="pr-3 text-xs">{r.cells.stock}</td>
                  <td className="max-w-[300px] text-xs">
                    {r.result?.ok ? <span className="font-semibold text-emerald-700">✓ Created{r.result.status === "PENDING_QC" ? " · in QC" : " · draft"}</span>
                      : problem ? <span className="text-red-700">{problem}</span>
                      : <span className="font-semibold text-slate-700">Ready</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type StockItem = { sku: string; title: string; variant: string; status: string; onHand: number; reserved: number };

function UpdateStock() {
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [changes, setChanges] = useState<Array<{ sku: string; onHand: number; before?: number; title?: string }>>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await fetch("/api/v1/products/stock", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? "Couldn't load your products.");
    setItems(d.items ?? []);
    return (d.items ?? []) as StockItem[];
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  function downloadSheet() {
    if (!items) return;
    download("loimart-stock.csv", toCsv([["SKU", "Product", "Variant", "Status", "Reserved for orders", "Stock"], ...items.map((i) => [i.sku, i.title, i.variant, i.status.replaceAll("_", " ").toLowerCase(), i.reserved, i.onHand])]));
  }

  async function onSheet(file: File) {
    setError(""); setResult(""); setChanges([]); setProblems([]);
    try {
      const table = parseCsv(await readFileText(file));
      const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
      const skuCol = header.findIndex((h) => h.replace(/\*/g, "").trim() === "sku");
      const stockCol = header.findIndex((h) => /^(stock|quantity|qty|inventory)\b/.test(h.replace(/\*/g, "").trim()));
      if (skuCol < 0 || stockCol < 0) throw new Error("The sheet needs a SKU column and a Stock column. Start from \"Download my stock sheet\".");
      const known = new Map((items ?? await load()).map((i) => [i.sku, i]));
      const bad: string[] = [];
      const next = new Map<string, number>();
      table.slice(1).forEach((r, i) => {
        const sku = (r[skuCol] ?? "").trim();
        const raw = (r[stockCol] ?? "").replace(/[,\s]/g, "");
        if (!sku) return;
        if (!/^\d+$/.test(raw) || Number(raw) > 1_000_000) { bad.push(`Row ${i + 2} (${sku}): stock "${r[stockCol] ?? ""}" isn't a whole number`); return; }
        if (!known.has(sku)) { bad.push(`Row ${i + 2}: SKU ${sku} isn't one of your products`); return; }
        next.set(sku, Number(raw));
      });
      if (next.size > BULK_PRODUCT_LIMITS.maxStockRows) throw new Error(`Up to ${BULK_PRODUCT_LIMITS.maxStockRows} SKUs per file.`);
      setProblems(bad);
      setChanges([...next].filter(([sku, n]) => known.get(sku)!.onHand !== n).map(([sku, onHand]) => ({ sku, onHand, before: known.get(sku)!.onHand, title: known.get(sku)!.title })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read this file.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  async function apply() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/v1/products/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: changes.map(({ sku, onHand }) => ({ sku, onHand })) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? "Couldn't update stock.");
      setResult(`Stock updated for ${d.updated} SKU${d.updated === 1 ? "" : "s"}. It's live on the store now.`);
      setChanges([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update stock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Step n={1} title="Download your stock sheet">
        <p className="text-sm text-slate-600">It lists every SKU with its current stock. Change only the <b>Stock</b> column and save as CSV.</p>
        <button type="button" disabled={!items?.length} onClick={downloadSheet} className={primary + " mt-4"}>{items ? `Download my stock sheet (${items.length} SKUs)` : "Loading…"}</button>
        {items && !items.length ? <p className="mt-3 text-sm text-slate-500">You don&apos;t have any products yet. Add some first.</p> : null}
      </Step>
      <Step n={2} title="Upload it and check the changes" done={Boolean(result)}>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-slate-900"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void onSheet(f); }}>
          <span className="text-sm font-bold">Choose your CSV file or drop it here</span>
          <span className="mt-1 text-xs text-slate-500">Stock changes go live straight away; they don&apos;t need QC.</span>
          <input ref={input} type="file" accept=".csv,text/csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onSheet(f); }} />
        </label>
        {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {problems.length ? <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{problems.slice(0, 20).map((p) => <li key={p}>{p}</li>)}{problems.length > 20 ? <li>…and {problems.length - 20} more</li> : null}</ul> : null}
        {changes.length ? (
          <div className="mt-4">
            <p className="text-sm"><b>{changes.length}</b> SKU{changes.length === 1 ? "" : "s"} will change:</p>
            <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-2">SKU</th><th className="p-2">Product</th><th className="p-2 text-right">Now</th><th className="p-2 text-right">New</th></tr></thead>
                <tbody>{changes.map((c) => <tr key={c.sku} className="border-t border-slate-100"><td className="p-2 font-semibold">{c.sku}</td><td className="p-2">{c.title}</td><td className="p-2 text-right text-slate-400">{c.before}</td><td className="p-2 text-right font-bold">{c.onHand}</td></tr>)}</tbody>
              </table>
            </div>
            <button type="button" disabled={busy} onClick={() => void apply()} className={primary + " mt-4"}>{busy ? "Updating…" : `Update stock for ${changes.length} SKU${changes.length === 1 ? "" : "s"}`}</button>
          </div>
        ) : null}
        {result ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{result}</p> : null}
      </Step>
    </>
  );
}
