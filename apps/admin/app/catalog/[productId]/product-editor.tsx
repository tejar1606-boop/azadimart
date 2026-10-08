"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { directUpload, PortalPageHeader, readImageSize } from "@azadimart/ui";
import SeoFields from "../../_components/seo-fields";

type Variant = { id: string; title: string; sku: string; pricePaise: number; compareAtPaise: number | null; weightGrams: number; isActive: boolean; onHand: number; reserved: number };
type Media = { mediaAssetId: string; kind: "IMAGE" | "VIDEO"; url: string };
type Detail = {
  product: { id: string; title: string; slug: string; description: string | null; metaTitle: string | null; metaDescription: string | null; status: string; categoryId: string; sellerName: string };
  variants: Variant[];
  media: Media[];
  categories: Array<{ id: string; name: string; isActive: boolean }>;
  hasOrders: boolean;
};

const rupees = (paise: number | null) => (paise === null ? "" : String(paise / 100));
const toPaise = (value: string) => Math.round(Number(value || 0) * 100);
const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900";
const card = "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6";
const STATUS_LABEL: Record<string, string> = { LIVE: "Live", UNLISTED: "Hidden from store", ARCHIVED: "Archived", DRAFT: "Draft", PENDING_QC: "In QC", PENDING_ADMIN_APPROVAL: "Awaiting approval", QC_REJECTED: "Needs changes" };

export default function ProductEditor({ productId, storefrontUrl }: { productId: string; storefrontUrl: string }) {
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [variants, setVariants] = useState<Array<Variant & { price: string; mrp: string }>>([]);
  const [images, setImages] = useState<Media[]>([]);
  const [video, setVideo] = useState<Media | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  async function load() {
    const response = await fetch(`/api/v1/catalog/products/${productId}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? "Could not load product");
    setData(body);
    setTitle(body.product.title);
    setDescription(body.product.description ?? "");
    setMetaTitle(body.product.metaTitle ?? "");
    setMetaDescription(body.product.metaDescription ?? "");
    setCategoryId(body.product.categoryId);
    setVariants(body.variants.map((v: Variant) => ({ ...v, price: rupees(v.pricePaise), mrp: rupees(v.compareAtPaise) })));
    setImages(body.media.filter((m: Media) => m.kind === "IMAGE"));
    setVideo(body.media.find((m: Media) => m.kind === "VIDEO") ?? null);
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(file: File, kind: "IMAGE" | "VIDEO") {
    setError(""); setUploading(kind);
    try {
      if (kind === "IMAGE") {
        const size = await readImageSize(file);
        if (Math.abs(size.width - size.height) / Math.max(size.width, size.height) > 0.02) throw new Error(`Product images must be square (1:1). This image is ${size.width} × ${size.height}.`);
      }
      const result = await directUpload(file, { purpose: kind === "IMAGE" ? "PRODUCT_IMAGE" : "PRODUCT_VIDEO", productId });
      const media = { mediaAssetId: result.mediaAssetId, kind, url: result.url };
      if (kind === "IMAGE") setImages((all) => [...all, media].slice(0, 8)); else setVideo(media);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally { setUploading(null); }
  }

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/v1/catalog/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, description, categoryId, metaTitle, metaDescription,
          variants: variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku, pricePaise: toPaise(v.price), compareAtPaise: v.mrp ? toPaise(v.mrp) : null, weightGrams: Number(v.weightGrams) || 0, onHand: Number(v.onHand) || 0, isActive: v.isActive })),
          imageAssetIds: images.map((m) => m.mediaAssetId),
          videoAssetId: video?.mediaAssetId ?? null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(body?.error?.details) && body.error.details[0] ? ` — ${body.error.details[0].message}` : "";
        throw new Error((body?.error?.message ?? "Save failed") + detail);
      }
      setMessage("Saved. Changes are live on the storefront.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  async function changeStatus(action: "hide" | "show" | "archive" | "restore") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/v1/catalog/products/${productId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Action failed");
      setMessage({ hide: "Hidden from the store.", show: "Live on the store again.", archive: "Archived: hidden everywhere, records kept.", restore: "Restored as hidden. Show it on the store when ready." }[action]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/catalog/products/${productId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Delete failed");
      router.replace("/catalog");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setConfirmDelete(false);
    } finally { setBusy(false); }
  }

  const move = (index: number, delta: number) => setImages((all) => { const j = index + delta; if (j < 0 || j >= all.length) return all; const next = [...all]; [next[index], next[j]] = [next[j]!, next[index]!]; return next; });
  const status = data?.product.status ?? "";

  if (!data) return <main className="px-4 py-10 lg:px-10"><p className="text-sm text-slate-500">{error || "Loading…"}</p></main>;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link href="/catalog" className="text-sm font-semibold text-slate-500 hover:text-slate-900">← All products</Link>
      <div className="mt-3">
        <PortalPageHeader
          eyebrow={`${data.product.sellerName} · ${STATUS_LABEL[status] ?? status}`}
          title={data.product.title}
          description="Edits apply immediately. Only AzadiMart admins can edit or delete products."
          actions={<>
            {status === "LIVE" && storefrontUrl ? <a href={`${storefrontUrl}/products/${data.product.slug}`} target="_blank" rel="noreferrer" className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900">View on store ↗</a> : null}
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
          </>}
        />
      </div>
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className={card}>
            <h2 className="font-semibold">Details</h2>
            <div className="mt-4 grid gap-4">
              <label className="text-sm font-medium">Title<input className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="text-sm font-medium">Category
                <select className={field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {data.categories.filter((c) => c.isActive || c.id === categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}{c.isActive ? "" : " (inactive)"}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Description<textarea className={field + " min-h-36"} value={description} maxLength={20000} onChange={(e) => setDescription(e.target.value)} /></label>
            </div>
          </section>

          <section className={card}>
            <h2 className="font-semibold">Search engine (SEO)</h2>
            <p className="mt-1 text-sm text-slate-500">How this product appears on Google and when the link is shared on WhatsApp.</p>
            <div className="mt-4">
              <SeoFields
                title={metaTitle}
                description={metaDescription}
                onTitle={setMetaTitle}
                onDescription={setMetaDescription}
                autoTitle={`${title || "Product name"} – Buy online at ₹${variants[0]?.price || "…"}`}
                autoDescription={`Buy ${title || "this product"} for ₹${variants[0]?.price || "…"} from ${data.product.sellerName}, a verified seller on AzadiMart. Cash on Delivery and easy returns.`}
                path={"/products/" + data.product.slug}
              />
            </div>
          </section>

          <section className={card}>
            <h2 className="font-semibold">Price, MRP &amp; stock</h2>
            <div className="mt-4 space-y-4">
              {variants.map((v, i) => {
                const set = (patch: Partial<typeof v>) => setVariants((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={v.id} className="rounded-xl bg-panel p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="text-xs font-medium">Variant name<input className={field} value={v.title} onChange={(e) => set({ title: e.target.value })} /></label>
                      <label className="text-xs font-medium">SKU<input className={field} value={v.sku} onChange={(e) => set({ sku: e.target.value })} /></label>
                      <label className="flex items-end gap-2 pb-2.5 text-xs font-medium"><input type="checkbox" checked={v.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-4 w-4" />Available for sale</label>
                      <label className="text-xs font-medium">Price (₹)<input className={field} inputMode="decimal" value={v.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, "") })} /></label>
                      <label className="text-xs font-medium">MRP (₹)<input className={field} inputMode="decimal" value={v.mrp} placeholder="Optional" onChange={(e) => set({ mrp: e.target.value.replace(/[^\d.]/g, "") })} /></label>
                      <label className="text-xs font-medium">Package weight (g)<input className={field} inputMode="numeric" value={String(v.weightGrams)} onChange={(e) => set({ weightGrams: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
                      <label className="text-xs font-medium">Stock on hand<input className={field} inputMode="numeric" value={String(v.onHand)} onChange={(e) => set({ onHand: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
                      <p className="self-end pb-2.5 text-xs text-slate-500 sm:col-span-2">{v.reserved ? `${v.reserved} reserved for open orders · ` : ""}{Math.max(0, v.onHand - v.reserved)} available to sell</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={card}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Photos <span className="text-sm font-normal text-slate-400">{images.length}/8 · square 1:1</span></h2>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.map((m, i) => (
                <div key={m.mediaAssetId} className="rounded-xl border border-slate-200 p-2">
                  <div className="relative aspect-square rounded-lg bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url("${m.url}")` }}>
                    {i === 0 ? <span className="absolute left-1.5 top-1.5 rounded-full bg-chrome px-2 py-0.5 text-[10px] font-semibold text-white">Cover</span> : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1 text-xs">
                    <span className="flex gap-1">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded border px-1.5 disabled:opacity-30" aria-label="Move left">←</button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} className="rounded border px-1.5 disabled:opacity-30" aria-label="Move right">→</button>
                    </span>
                    <button type="button" disabled={images.length <= 1} onClick={() => setImages((all) => all.filter((x) => x.mediaAssetId !== m.mediaAssetId))} className="font-semibold text-red-600 disabled:opacity-30">Remove</button>
                  </div>
                </div>
              ))}
              {images.length < 8 ? (
                <button type="button" disabled={Boolean(uploading)} onClick={() => imageInput.current?.click()} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:border-slate-500 disabled:opacity-50">
                  {uploading === "IMAGE" ? "Uploading…" : "+ Add photo"}
                </button>
              ) : null}
            </div>
            <input ref={imageInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "IMAGE"); e.currentTarget.value = ""; }} />

            <h3 className="mt-6 text-sm font-semibold">Video <span className="font-normal text-slate-400">(optional)</span></h3>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {video ? <video src={video.url} className="h-28 w-28 rounded-xl bg-black object-cover" muted playsInline controls /> : null}
              <button type="button" disabled={Boolean(uploading)} onClick={() => videoInput.current?.click()} className="rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-slate-900 disabled:opacity-50">{uploading === "VIDEO" ? "Uploading…" : video ? "Replace video" : "Add video"}</button>
              {video ? <button type="button" onClick={() => setVideo(null)} className="text-xs font-semibold text-red-600">Remove video</button> : null}
            </div>
            <input ref={videoInput} type="file" hidden accept="video/mp4,video/webm,video/quicktime" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "VIDEO"); e.currentTarget.value = ""; }} />
            <p className="mt-4 text-xs text-slate-500">Photo and video changes take effect when you click <b>Save changes</b>.</p>
          </section>
        </div>

        <aside className="space-y-6">
          <section className={card}>
            <h2 className="font-semibold">Visibility</h2>
            <p className="mt-1 text-sm text-slate-500">Current: <b>{STATUS_LABEL[status] ?? status}</b></p>
            <div className="mt-4 grid gap-2">
              {status === "LIVE" ? <button type="button" disabled={busy} onClick={() => void changeStatus("hide")} className="rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Hide from store</button> : null}
              {status === "UNLISTED" ? <button type="button" disabled={busy} onClick={() => void changeStatus("show")} className="rounded-xl bg-chrome px-4 py-2.5 text-sm font-semibold text-white">Show on store</button> : null}
              {status !== "ARCHIVED" ? <button type="button" disabled={busy} onClick={() => void changeStatus("archive")} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-50">Archive (hide everywhere)</button> : <button type="button" disabled={busy} onClick={() => void changeStatus("restore")} className="rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-slate-300">Restore</button>}
            </div>
          </section>
          <section className={card + " border-red-200"}>
            <h2 className="font-semibold text-red-700">Delete permanently</h2>
            <p className="mt-1 text-sm text-slate-500">{data.hasOrders ? "This product has orders, so it can't be deleted. Archive it instead to hide it everywhere while keeping order records." : "Removes the product, its variants, photos list and stock records. This can't be undone."}</p>
            {!data.hasOrders ? (
              confirmDelete ? (
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
                  <button type="button" disabled={busy} onClick={() => void remove()} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Yes, delete</button>
                </div>
              ) : <button type="button" onClick={() => setConfirmDelete(true)} className="mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50">Delete product…</button>
            ) : null}
          </section>
        </aside>
      </div>
    </main>
  );
}
