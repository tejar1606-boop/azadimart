"use client";

import { useState, type ClipboardEvent } from "react";

export type SpecRow = { label: string; value: string };

const MAX_ROWS = 40;
const COMMON_LABELS = ["Brand", "Model name", "Material", "Colour", "Size", "Dimensions", "Weight", "Warranty", "Country of origin", "Package includes"];

const clean = (s: string) => s.replace(/\u00a0/g, " ").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

/**
 * Turns pasted content into label/value rows. Reads HTML tables (from web
 * pages, Amazon/Flipkart listings, Google Docs), tab-separated rows (Excel,
 * Google Sheets) and "Label: value" lines. Only text is kept; the pasted
 * HTML itself is never stored or rendered.
 */
export function parseSpecPaste(html: string, text: string): SpecRow[] {
  const rows: SpecRow[] = [];
  if (html && /<tr[\s>]/i.test(html) && typeof DOMParser !== "undefined") {
    // DOMParser builds an inert document: scripts in the paste never run.
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, noscript, template").forEach((el) => el.remove());
    doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    doc.querySelectorAll("tr").forEach((tr) => {
      const cells = [...tr.querySelectorAll("th, td")].map((cell) => clean(cell.textContent ?? ""));
      if (cells.length >= 2 && cells[0]) rows.push({ label: cells[0], value: cells.slice(1).filter(Boolean).join(" ") });
    });
  } else {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const tab = line.indexOf("\t");
      const colon = line.indexOf(":");
      const at = tab > 0 ? tab : colon > 0 && colon < 60 ? colon : -1;
      if (at > 0) rows.push({ label: clean(line.slice(0, at)), value: clean(line.slice(at + 1).replace(/\t/g, " ")) });
      else if (rows.length) rows[rows.length - 1]!.value += "\n" + clean(line); // continuation of the previous value
    }
  }
  return rows.filter((r) => r.label && r.value).slice(0, MAX_ROWS).map((r) => ({ label: r.label.slice(0, 60), value: r.value.slice(0, 500) }));
}

/** Editable specification table: paste a whole table, or add and reorder rows by hand. */
export function SpecTableEditor({ rows, onChange }: { rows: SpecRow[]; onChange: (rows: SpecRow[]) => void }) {
  const [note, setNote] = useState("");
  const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900";
  const update = (i: number, patch: Partial<SpecRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= rows.length) return; const next = [...rows]; [next[i], next[j]] = [next[j]!, next[i]!]; onChange(next); };

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const parsed = parseSpecPaste(event.clipboardData.getData("text/html"), event.clipboardData.getData("text/plain"));
    event.preventDefault();
    if (!parsed.length) { setNote("Couldn't find a table in what you pasted. Use two columns (label and value), or lines like “Material: Cotton”."); return; }
    const kept = rows.filter((r) => r.label || r.value);
    const merged = [...kept, ...parsed].slice(0, MAX_ROWS);
    onChange(merged);
    setNote(`${merged.length - kept.length} row${merged.length - kept.length === 1 ? "" : "s"} added from your paste. Check them below.`);
  }

  return (
    <div className="space-y-3">
      <textarea
        onPaste={onPaste}
        value=""
        onChange={() => undefined}
        placeholder="Paste a table here: copy it from a web page, Amazon/Flipkart listing, Excel or Google Sheets (two columns: label and value), or lines like “Material: Cotton”."
        className="h-20 w-full resize-none rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-sm outline-none placeholder:text-slate-500 focus:border-brand"
        aria-label="Paste a specification table"
      />
      {note ? <p className="text-xs font-medium text-slate-600">{note}</p> : null}

      {rows.length ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="hidden grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_auto] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:grid"><span>Label</span><span>Value</span><span className="w-[88px]" /></div>
          <ul className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <li key={i} className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_auto] sm:items-start">
                <input className={field + " font-semibold"} maxLength={60} placeholder="e.g. Material" value={row.label} onChange={(e) => update(i, { label: e.target.value })} aria-label={`Label ${i + 1}`} />
                <textarea className={field + " min-h-[38px] resize-y"} rows={Math.min(5, Math.max(1, row.value.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 60)), 0)))} maxLength={500} placeholder="e.g. 100% cotton" value={row.value} onChange={(e) => update(i, { value: e.target.value })} aria-label={`Value ${i + 1}`} />
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid h-9 w-7 place-items-center rounded-md border text-xs disabled:opacity-30" aria-label="Move up">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="grid h-9 w-7 place-items-center rounded-md border text-xs disabled:opacity-30" aria-label="Move down">↓</button>
                  <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="grid h-9 w-7 place-items-center rounded-md border border-red-200 text-xs text-red-600" aria-label="Remove row">✕</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={rows.length >= MAX_ROWS} onClick={() => onChange([...rows, { label: "", value: "" }])} className="rounded-full border border-dashed border-slate-400 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-900 disabled:opacity-40">+ Add row</button>
        {COMMON_LABELS.filter((l) => !rows.some((r) => r.label.toLowerCase() === l.toLowerCase())).slice(0, 6).map((label) => (
          <button key={label} type="button" disabled={rows.length >= MAX_ROWS} onClick={() => onChange([...rows, { label, value: "" }])} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">+ {label}</button>
        ))}
        {rows.length ? <button type="button" onClick={() => { if (window.confirm("Remove all rows?")) onChange([]); }} className="ml-auto text-xs font-semibold text-red-600">Clear table</button> : null}
      </div>
      <p className="text-[11px] text-slate-500">{rows.length}/{MAX_ROWS} rows · shown to shoppers as a neat specifications table.</p>
    </div>
  );
}

/** Toggle between a normal text description and a specification table. */
export function DescriptionStyleToggle({ value, onChange }: { value: "text" | "table"; onChange: (value: "text" | "table") => void }) {
  return (
    <div role="radiogroup" aria-label="Description style" className="inline-flex rounded-full bg-slate-100 p-1">
      {([["text", "Normal description"], ["table", "Specification table"]] as const).map(([key, label]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)} className={"rounded-full px-3.5 py-1.5 text-xs font-semibold transition " + (value === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900")}>{label}</button>
      ))}
    </div>
  );
}
