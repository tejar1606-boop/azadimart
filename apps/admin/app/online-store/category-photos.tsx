"use client";

import { directUpload, readImageSize } from "@azadimart/ui";
import { useEffect, useRef, useState } from "react";

type Category = { id: string; name: string; parentId: string | null; isActive: boolean; liveCount: number; imageUrl: string | null };

/**
 * Photos for the round category row under the store header and the "Shop by
 * category" tiles. Each upload is saved straight away (no Publish needed).
 * A category without a photo uses one of its product photos.
 */
export default function CategoryPhotos({ onChange }: { onChange?: (photos: Record<string, string>, topNames: string[]) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch("/api/v1/catalog/categories", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? "Couldn't load categories");
    const items = (d.items ?? []) as Category[];
    setCategories(items);
    onChange?.(Object.fromEntries(items.filter((c) => c.imageUrl).map((c) => [c.name, c.imageUrl!])), items.filter((c) => !c.parentId && c.isActive).map((c) => c.name));
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(id: string, imageUrl: string) {
    const r = await fetch(`/api/v1/catalog/categories/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageUrl }) });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error?.message ?? "Couldn't save the photo");
    await load();
  }

  const top = categories.filter((c) => !c.parentId && c.isActive);
  const subsOf = (id: string) => categories.filter((c) => c.parentId === id && c.isActive);
  const missing = [...top, ...top.flatMap((c) => subsOf(c.id))].filter((c) => !c.imageUrl).length;

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Category photos</h2>
          <p className="mt-0.5 max-w-xl text-xs text-slate-500">Shown in the round row under the header and in the “Shop by category” tiles. Photos must be square (600 × 600 px, subject in the centre). Saved as soon as you upload, so you don&apos;t need to publish.</p>
        </div>
        <span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold " + (missing ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>{missing ? `${missing} without a photo` : "All have photos"}</span>
      </div>
      {error ? <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p> : null}
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {top.map((c) => <PhotoTile key={c.id} category={c} onSave={(url) => save(c.id, url)} />)}
      </ul>
      {top.some((c) => subsOf(c.id).length) ? (
        <div className="mt-6 border-t pt-4">
          <h3 className="text-sm font-semibold">Sub-category photos</h3>
          <p className="mt-0.5 max-w-xl text-xs text-slate-500">Shown in the “Top category” tiles on the home page and the category column on shop pages. Same size: square, 600 × 600 px.</p>
          {top.filter((c) => subsOf(c.id).length).map((parent) => (
            <div key={parent.id} className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{parent.name}</p>
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {subsOf(parent.id).map((c) => <PhotoTile key={c.id} category={c} onSave={(url) => save(c.id, url)} />)}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-slate-500">No photo? The store uses one of the category&apos;s product photos. Sub-categories don&apos;t appear in the round row; hidden categories don&apos;t appear anywhere. Add sub-categories and change the order in Catalogue → Categories.</p>
    </section>
  );
}

function PhotoTile({ category, onSave }: { category: Category; onSave: (url: string) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function upload(file: File) {
    setNote(""); setBusy(true);
    try {
      const size = await readImageSize(file);
      const ratio = size.width / size.height;
      if (Math.abs(ratio - 1) > 0.03) throw new Error(`This photo is ${size.width} × ${size.height}. Use a square photo (e.g. 600 × 600) so it isn't cropped.`);
      const result = await directUpload(file, { purpose: "SITE_IMAGE" });
      await onSave(result.url);
      if (size.width < 400) setNote("Saved. A bigger photo (600 × 600) will look sharper.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setNote(""); setBusy(true);
    try { await onSave(""); } catch (err) { setNote(err instanceof Error ? err.message : "Couldn't remove"); } finally { setBusy(false); }
  }

  return (
    <li className="flex flex-col items-center rounded-xl border border-slate-200 p-3 text-center">
      <span className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-[#F3EDFD]">
        {category.imageUrl
          ? <img src={category.imageUrl} alt="" className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
          : <span className="text-[10px] font-semibold text-slate-400">No photo</span>}
        {busy ? <span className="absolute inset-0 grid place-items-center bg-white/70 text-[11px] font-semibold">Saving…</span> : null}
      </span>
      <p className="mt-2 line-clamp-2 min-h-8 text-xs font-semibold leading-4 text-slate-900">{category.name}</p>
      <p className="text-[10px] text-slate-400">{category.liveCount} live products</p>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rounded-md bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">{category.imageUrl ? "Replace" : "Upload photo"}</button>
        {category.imageUrl ? <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50">Remove</button> : null}
      </div>
      {note ? <p className="mt-1.5 text-[10.5px] leading-4 text-amber-700">{note}</p> : null}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
    </li>
  );
}
