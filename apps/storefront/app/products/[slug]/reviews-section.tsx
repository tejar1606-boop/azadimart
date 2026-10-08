"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { directUpload } from "@azadimart/ui";
import { Stars } from "../../components/stars";
import type { ReviewItem, ReviewSort, ReviewSummary } from "../../lib/reviews";
import MediaLightbox, { type LightboxItem } from "./media-lightbox";

type Photo = { id: string; url: string; reviewId?: string };
type Eligibility = { signedIn: boolean; canReview: boolean; review: { id: string; rating: number; title: string | null; body: string | null; status: string; photos: Array<{ mediaAssetId: string; url: string }> } | null };

const LABELS = ["", "Very bad", "Bad", "Okay", "Good", "Very good"];
const SORTS: Array<[ReviewSort, string]> = [["recent", "Most recent"], ["photos", "With photos"], ["highest", "Highest rating"], ["lowest", "Lowest rating"]];
const keyOf = (url: string) => url.replace(/^\/media\//, "");
const toLightbox = (photos: Photo[]): LightboxItem[] => photos.map((p) => ({ mediaAssetId: p.id, mediaStorageKey: keyOf(p.url), altText: "Customer photo", kind: "IMAGE" }));

/**
 * "Ratings & reviews" on the product page: star summary with breakdown bars
 * (click to filter), customer photos, sortable review list with seller
 * replies, and the write/edit form for verified buyers.
 */
export default function ReviewsSection({ productId, slug, productTitle, summary, initial, photos }: {
  productId: string;
  slug: string;
  productTitle: string;
  summary: ReviewSummary;
  initial: { items: ReviewItem[]; nextOffset: number | null };
  photos: Photo[];
}) {
  const [items, setItems] = useState(initial.items);
  const [nextOffset, setNextOffset] = useState(initial.nextOffset);
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: Photo[]; index: number } | null>(null);
  const first = useRef(true);

  useEffect(() => { setItems(initial.items); setNextOffset(initial.nextOffset); }, [initial]);

  async function fetchPage(offset: number, nextSort = sort, nextRating = rating) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ productId, sort: nextSort, offset: String(offset) });
      if (nextRating) params.set("rating", String(nextRating));
      const body = await fetch("/api/v1/reviews?" + params, { cache: "no-store" }).then((r) => r.json());
      setItems((current) => (offset ? [...current, ...(body.items ?? [])] : body.items ?? []));
      setNextOffset(body.nextOffset ?? null);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    void fetchPage(0, sort, rating);
  }, [sort, rating]); // eslint-disable-line react-hooks/exhaustive-deps

  const max = Math.max(1, ...Object.values(summary.distribution));

  return (
    <section id="reviews" aria-labelledby="reviews-title" className="mt-12 scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-8">
      <h2 id="reviews-title" className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">Ratings &amp; reviews</h2>

      <div className="mt-6 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          {summary.count ? (
            <>
              <div className="flex items-end gap-3">
                <p className="text-5xl font-semibold tracking-[-0.04em]">{summary.average.toFixed(1)}</p>
                <div className="pb-1.5"><Stars value={summary.average} size={18} /><p className="mt-1 text-xs text-slate-500">{summary.count.toLocaleString("en-IN")} verified rating{summary.count === 1 ? "" : "s"}</p></div>
              </div>
              <ul className="mt-5 space-y-1.5">
                {([5, 4, 3, 2, 1] as const).map((star) => {
                  const n = summary.distribution[star];
                  const on = rating === star;
                  return (
                    <li key={star}>
                      <button type="button" disabled={!n} onClick={() => setRating(on ? null : star)} aria-pressed={on} className={"grid w-full grid-cols-[34px_minmax(0,1fr)_40px] items-center gap-2 rounded-lg px-1.5 py-1 text-xs transition disabled:cursor-default " + (on ? "bg-brand-50 ring-1 ring-brand/40" : "hover:bg-slate-50")}>
                        <span className="font-semibold text-slate-700">{star} ★</span>
                        <span className="h-2 overflow-hidden rounded-full bg-slate-100"><span className={"block h-full rounded-full " + (star >= 4 ? "bg-india" : star === 3 ? "bg-[#7cb342]" : star === 2 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${(n / max) * 100}%` }} /></span>
                        <span className="text-right text-slate-500">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="rounded-2xl bg-slate-50 p-5"><p className="font-semibold">No reviews yet</p><p className="mt-1 text-sm text-slate-500">Bought this? Be the first to share your experience.</p></div>
          )}
          <WriteReview productId={productId} slug={slug} productTitle={productTitle} />
        </div>

        <div className="min-w-0">
          {photos.length ? (
            <div className="mb-6">
              <p className="text-sm font-semibold">Customer photos <span className="font-normal text-slate-400">({summary.photoCount})</span></p>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {photos.map((p, i) => (
                  <button key={p.id} type="button" onClick={() => setLightbox({ photos, index: i })} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 transition hover:ring-slate-900 sm:h-24 sm:w-24" aria-label={`Open customer photo ${i + 1}`}>
                    <Image src={p.url} alt="" fill sizes="96px" className="object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {summary.count ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <p className="text-sm text-slate-500">{rating ? <>Showing {rating}-star reviews · <button type="button" onClick={() => setRating(null)} className="font-semibold text-brand-600">Show all</button></> : "All reviews are from verified buyers."}</p>
              <select value={sort} onChange={(e) => setSort(e.target.value as ReviewSort)} className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold outline-none" aria-label="Sort reviews">
                {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          ) : null}

          <ul className={"divide-y divide-slate-100 " + (loading ? "opacity-60" : "")}>
            {items.map((r) => (
              <li key={r.id} className="py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={r.rating} size={15} />
                  {r.title ? <p className="text-sm font-semibold">{r.title}</p> : null}
                </div>
                {r.body ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{r.body}</p> : null}
                {r.photos.length ? (
                  <div className="mt-3 flex gap-2">
                    {r.photos.map((p, i) => (
                      <button key={p.id} type="button" onClick={() => setLightbox({ photos: r.photos, index: i })} className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 hover:ring-slate-900" aria-label={`Open photo ${i + 1} from ${r.authorName}`}>
                        <Image src={p.url} alt="" fill sizes="64px" className="object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{r.authorName}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-india-light px-2 py-0.5 font-semibold text-india"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>Verified buyer</span>
                  <span>{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{r.edited ? " · edited" : ""}</span>
                </p>
                {r.sellerReply ? (
                  <div className="mt-3 rounded-xl border-l-4 border-brand bg-brand-50/60 px-4 py-3">
                    <p className="text-xs font-semibold text-brand-700">Reply from the seller</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{r.sellerReply}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {nextOffset !== null ? (
            <button type="button" disabled={loading} onClick={() => void fetchPage(nextOffset)} className="mt-2 w-full rounded-full border border-slate-300 py-2.5 text-sm font-semibold hover:border-slate-900 disabled:opacity-50">{loading ? "Loading…" : "Show more reviews"}</button>
          ) : null}
        </div>
      </div>

      {lightbox ? <MediaLightbox items={toLightbox(lightbox.photos)} index={lightbox.index} title="Customer photos" onIndex={(index) => setLightbox({ ...lightbox, index })} onClose={() => setLightbox(null)} /> : null}
    </section>
  );
}

/** Write or edit a review; shown to verified buyers only. */
function WriteReview({ productId, slug, productTitle }: { productId: string; slug: string; productTitle: string }) {
  const router = useRouter();
  const [state, setState] = useState<Eligibility | null>(null);
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<Array<{ mediaAssetId: string; url: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    const body = await fetch(`/api/v1/reviews/eligibility?productId=${productId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setState(body);
    return body as Eligibility | null;
  }
  useEffect(() => {
    void load().then((s) => {
      // Arriving from "Rate & review" on an order opens the form straight away.
      if (s?.canReview && new URLSearchParams(window.location.search).get("review") === "1") startEditing(s);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startEditing(s = state) {
    const r = s?.review;
    setStars(r?.rating ?? 0); setTitle(r?.title ?? ""); setBody(r?.body ?? ""); setPhotos(r?.photos ?? []);
    setError(""); setMessage(""); setOpen(true);
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError(""); setUploading(true);
    try {
      for (const file of [...files].slice(0, 4 - photos.length)) {
        if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} is larger than 15 MB.`);
        const result = await directUpload(file, { purpose: "REVIEW_IMAGE" });
        setPhotos((all) => [...all, { mediaAssetId: result.mediaAssetId, url: result.url }].slice(0, 4));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally { setUploading(false); }
  }

  async function submit() {
    if (!stars) { setError("Please choose a star rating."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, rating: stars, title, body, mediaAssetIds: photos.map((p) => p.mediaAssetId) }) });
      const result = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(result?.error?.details) && result.error.details[0] ? result.error.details[0].message : "";
        throw new Error(detail || result?.error?.message || "Could not save your review.");
      }
      setOpen(false);
      setMessage(result.review?.status === "HIDDEN" ? "Saved. Your review is currently hidden by AzadiMart." : "Thank you! Your review is live.");
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!state?.review || !window.confirm("Delete your review?")) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/reviews/${state.review.id}`, { method: "DELETE" });
      setOpen(false); setMessage("Your review was deleted.");
      await load();
      router.refresh();
    } finally { setBusy(false); }
  }

  if (!state) return null;
  const shown = hover || stars;

  return (
    <div className="mt-6">
      {message ? <p className="mb-3 rounded-xl bg-india-light px-3 py-2 text-sm text-india">{message}</p> : null}
      {!state.signedIn ? (
        <Link href={`/login?next=${encodeURIComponent(`/products/${slug}?review=1#reviews`)}`} className="inline-flex rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold hover:border-slate-900">Sign in to write a review</Link>
      ) : !state.canReview ? (
        <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Only verified buyers can review. You can rate this product after it&apos;s delivered to you.</p>
      ) : !open ? (
        <button type="button" onClick={() => startEditing()} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">{state.review ? "Edit your review" : "Write a review"}</button>
      ) : null}

      {open ? (
        <div className="mt-2 rounded-2xl border border-slate-200 p-4">
          <p className="text-sm font-semibold">Rate {productTitle.length > 40 ? "this product" : productTitle}</p>
          <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}: ${LABELS[n]}`} onMouseEnter={() => setHover(n)} onClick={() => setStars(n)} className="p-0.5">
                <svg width="30" height="30" viewBox="0 0 24 24" fill={n <= shown ? "#f59e0b" : "#e2e8f0"}><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8L12 2.8Z" /></svg>
              </button>
            ))}
            <span className="ml-2 text-xs font-semibold text-slate-600">{LABELS[shown]}</span>
          </div>
          <label className="mt-4 block text-xs font-medium text-slate-600">Title (optional)
            <input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Great quality for the price" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-600">Your review (optional)
            <textarea value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} placeholder="What did you like or dislike? How was the quality, size and delivery?" className="mt-1 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </label>
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-600">Photos (optional, up to 4)</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {photos.map((p) => (
                <div key={p.mediaAssetId} className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-100">
                  <Image src={p.url} alt="" fill sizes="64px" className="object-cover" />
                  <button type="button" onClick={() => setPhotos((all) => all.filter((x) => x.mediaAssetId !== p.mediaAssetId))} className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-[10px] text-white" aria-label="Remove photo">✕</button>
                </div>
              ))}
              {photos.length < 4 ? (
                <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className="grid h-16 w-16 place-items-center rounded-lg border-2 border-dashed border-slate-300 text-[11px] font-semibold text-slate-500 hover:border-slate-500 disabled:opacity-50">{uploading ? "…" : "+ Add"}</button>
              ) : null}
              <input ref={fileInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => { void addPhotos(e.target.files); e.currentTarget.value = ""; }} />
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || uploading} onClick={() => void submit()} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Saving…" : state.review ? "Update review" : "Submit review"}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Cancel</button>
            {state.review ? <button type="button" disabled={busy} onClick={() => void remove()} className="ml-auto text-xs font-semibold text-red-600">Delete review</button> : null}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Please keep it honest and respectful. Reviews with abuse, personal details or links may be removed.</p>
        </div>
      ) : null}
    </div>
  );
}
