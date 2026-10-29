"use client";

import { useState } from "react";
import { BULK_REVIEW_COLUMNS, BULK_REVIEW_LIMITS, BULK_REVIEW_TEMPLATE, mapReviewHeaders, parseCsv, readReviewCsvRow, toCsv, type BulkReviewKey } from "@azadimart/shared";

type Problem = { line: number; message: string };

/**
 * Bulk upload of genuine reviews from other sites: download the template,
 * fill one row per review, add one proof file (screenshot or PDF export),
 * check, then import. Admin imports go live; seller imports wait for approval.
 */
export function BulkReviewImport({ proofUrl, bulkUrl, needsApproval, onDone, onCancel }: { proofUrl: string; bulkUrl: string; needsApproval: boolean; onDone: (count: number) => void; onCancel: () => void }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [proof, setProof] = useState<{ id: string; name: string } | null>(null);
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [ready, setReady] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function downloadTemplate() {
    const blob = new Blob([toCsv(BULK_REVIEW_TEMPLATE)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "loimart-reviews-template.csv"; a.click();
    URL.revokeObjectURL(a.href);
  }

  async function readFile(file: File) {
    setError(""); setProblems(null); setReady(0); setRows([]); setFileName(file.name);
    const table = parseCsv(await file.text());
    const [header, ...body] = table;
    if (!header) { setError("The file is empty."); return; }
    const { columns, missing } = mapReviewHeaders(header);
    if (missing.length) { setError(`Missing columns: ${missing.join(", ")}. Use the template.`); return; }
    if (body.length > BULK_REVIEW_LIMITS.maxRows) { setError(`Up to ${BULK_REVIEW_LIMITS.maxRows} reviews per file; this one has ${body.length}. Split it into smaller files.`); return; }
    setRows(body.map((cells) => readReviewCsvRow(Object.fromEntries(columns.flatMap((key, i) => (key ? [[key, (cells[i] ?? "").trim()]] : []))) as Partial<Record<BulkReviewKey, string>>)));
  }

  async function uploadProof(file: File) {
    setError(""); setBusy(true);
    try {
      const data = new FormData(); data.append("file", file);
      const r = await fetch(proofUrl, { method: "POST", body: data });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.message ?? "Upload failed");
      setProof({ id: b.proofAssetId, name: file.name }); setProblems(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); }
  }

  async function send(dryRun: boolean) {
    if (!proof) return;
    setError(""); setBusy(true);
    try {
      const r = await fetch(bulkUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proofAssetId: proof.id, dryRun, rows }) });
      const b = await r.json().catch(() => null);
      if (r.status === 422 || (b && Array.isArray(b.problems) && b.problems.length)) { setProblems(b.problems); setReady(0); return; }
      if (!r.ok) throw new Error(b?.error?.message ?? "Something went wrong");
      if (dryRun) { setProblems([]); setReady(b.ready); } else onDone(b.created);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  }

  const step = "flex gap-3 border-t border-slate-100 py-4 first:border-t-0";
  const num = "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-bold text-white";
  const checked = problems !== null && problems.length === 0 && ready > 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-title">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lift">
        <h2 id="bulk-title" className="text-lg font-semibold">Bulk upload reviews from other sites</h2>
        <p className="mt-1 text-sm text-slate-500">Genuine reviews your products earned elsewhere, up to {BULK_REVIEW_LIMITS.maxRows} per file. They show as &ldquo;Imported from …&rdquo; and don&apos;t change the star rating.{needsApproval ? " Our team checks the proof before they go live." : ""}</p>

        <ol className="mt-4">
          <li className={step}><span className={num}>1</span><div>
            <p className="font-semibold">Download the template</p>
            <p className="text-xs text-slate-500">Columns: {BULK_REVIEW_COLUMNS.map((c) => c.header + (c.required ? "" : " (optional)")).join(" · ")}</p>
            <button type="button" onClick={downloadTemplate} className="mt-2 rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold hover:border-slate-900">Download template (.csv)</button>
          </div></li>
          <li className={step}><span className={num}>2</span><div>
            <p className="font-semibold">Fill it in Excel or Google Sheets</p>
            <p className="text-xs text-slate-500">One row per review, copied word for word. Use the product&apos;s SKU, stars 1 to 5, and the date as YYYY-MM-DD. Save as <b>CSV</b>.</p>
          </div></li>
          <li className={step}><span className={num}>3</span><div>
            <p className="font-semibold">Choose the filled file</p>
            <label className="mt-2 inline-block cursor-pointer rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold hover:border-slate-900">{fileName ? "Change file" : "Choose CSV file"}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
            </label>
            {fileName ? <p className="mt-1 text-xs text-slate-600">{fileName}: <b>{rows.length}</b> review{rows.length === 1 ? "" : "s"} found</p> : null}
          </div></li>
          <li className={step}><span className={num}>4</span><div>
            <p className="font-semibold">Upload proof</p>
            <p className="text-xs text-slate-500">A screenshot or PDF export of these reviews on the other site. Only our team sees it.</p>
            <label className="mt-2 inline-block cursor-pointer rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold hover:border-slate-900">{proof ? "Change proof" : "Upload screenshot or PDF"}
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadProof(f); }} />
            </label>
            {proof ? <p className="mt-1 text-xs text-green-700">✓ {proof.name}</p> : null}
          </div></li>
          <li className={step}><span className={num}>5</span><div className="min-w-0 flex-1">
            <p className="font-semibold">Check and import</p>
            <button type="button" disabled={!rows.length || !proof || busy} onClick={() => void send(true)} className="mt-2 rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold hover:border-slate-900 disabled:opacity-40">{busy ? "Checking…" : "Check file"}</button>
            {problems && problems.length ? (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-red-50 p-3 text-xs text-red-800">
                <p className="font-semibold">Fix these rows in your file, then choose it again:</p>
                <ul className="mt-1 space-y-0.5">{problems.slice(0, 100).map((p, i) => <li key={i}>Row {p.line}: {p.message}</li>)}</ul>
                {problems.length > 100 ? <p className="mt-1">…and {problems.length - 100} more</p> : null}
              </div>
            ) : null}
            {checked ? <p className="mt-2 text-xs font-semibold text-green-700">✓ All {ready} reviews look good.</p> : null}
            {checked ? (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>I confirm these are real reviews written by real customers, copied without changes. Fake reviews are not allowed and are removed.</span>
              </label>
            ) : null}
          </div></li>
        </ol>

        {error ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
          <button type="button" disabled={!checked || !confirmed || busy} onClick={() => void send(false)} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{needsApproval ? `Send ${ready || ""} for approval` : `Import ${ready || ""} reviews`}</button>
        </div>
      </div>
    </div>
  );
}
