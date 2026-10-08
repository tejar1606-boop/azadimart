"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ProductCard from "../components/product-card";
import type { RailCategory } from "../lib/category-rail";

type Variant = { id: string; title: string; pricePaise: number; compareAtPaise: number | null; availableQuantity: number };
/** Set on a category page (/c/<slug>): the category is fixed and shown as the page title. */
export type FixedCategory = { id: string; name: string; slug: string; intro?: string | null; parent: { name: string; slug: string } | null; children: Array<{ name: string; slug: string }> };
type Product = { id: string; title: string; slug: string; description: string | null; categoryName: string; sellerName: string; reviewCount?: number; ratingTotal?: number; variants: Variant[]; media?: Array<{ storageKey: string; kind: string; altText: string | null }> };

const SORTS: Array<[string, string]> = [["featured", "Featured"], ["newest", "Newest"], ["price_asc", "Price: Low to high"], ["price_desc", "Price: High to low"]];

function GridIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>;
}

function Thumb({ imageKey, className }: { imageKey: string | null; className: string }) {
  return (
    <span className={"relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-500 " + className}>
      {imageKey ? <Image src={"/media/" + imageKey} alt="" fill sizes="64px" className="object-cover" /> : <GridIcon />}
    </span>
  );
}

/**
 * Category column on the left of the shop pages, on phones as well as desktop,
 * so shoppers switch category in one tap. The open main category lists its
 * sub-categories underneath.
 */
function CategoryRail({ rail, activeId }: { rail: RailCategory[]; activeId: string }) {
  const active = rail.find((c) => c.id === activeId);
  const openParent = active?.parentId ?? active?.id ?? "";
  // Empty categories stay out of the column (so shoppers never land on an empty page), unless open.
  const shown = (c: RailCategory) => c.count > 0 || c.id === activeId || c.id === openParent;
  const top = rail.filter((c) => !c.parentId && shown(c));
  const item = (selected: boolean) =>
    "group relative flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center transition lg:flex-row lg:gap-3 lg:px-2.5 lg:text-left " +
    (selected ? "bg-white shadow-card ring-1 ring-brand/30" : "hover:bg-white/70");
  const bar = (selected: boolean) => (selected ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand" aria-hidden="true" /> : null);
  const label = (selected: boolean) => "line-clamp-2 text-[11px] leading-tight lg:text-sm " + (selected ? "font-semibold text-slate-950" : "font-medium text-slate-700 group-hover:text-slate-950");

  return (
    <nav aria-label="Categories" className="sticky top-[136px] max-h-[calc(100vh-148px)] overflow-y-auto overscroll-contain rounded-2xl bg-slate-100/80 p-1.5 [scrollbar-width:none] lg:top-[132px] lg:max-h-[calc(100vh-150px)] lg:p-2">
      <p className="hidden px-2.5 pb-2 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 lg:block">Categories</p>
      <ul className="space-y-1">
        <li>
          <Link href="/products" aria-current={!activeId ? "page" : undefined} className={item(!activeId)}>
            {bar(!activeId)}
            <Thumb imageKey={null} className={"h-12 w-12 lg:h-11 lg:w-11 " + (!activeId ? "bg-brand/10 text-brand-600" : "")} />
            <span className={label(!activeId)}>All products</span>
          </Link>
        </li>
        {top.map((c) => {
          const selected = c.id === activeId;
          const children = c.id === openParent ? rail.filter((x) => x.parentId === c.id && shown(x)) : [];
          return (
            <li key={c.id}>
              <Link href={"/c/" + c.slug} aria-current={selected ? "page" : undefined} className={item(selected)}>
                {bar(selected)}
                <Thumb imageKey={c.imageKey} className="h-12 w-12 lg:h-11 lg:w-11" />
                <span className="min-w-0 lg:flex-1">
                  <span className={label(selected)}>{c.name}</span>
                  <span className="hidden text-xs text-slate-400 lg:block">{c.count} item{c.count === 1 ? "" : "s"}</span>
                </span>
              </Link>
              {children.length ? (
                <ul className="mb-1 mt-1 space-y-0.5 lg:ml-[3.25rem]">
                  {children.map((child) => {
                    const on = child.id === activeId;
                    return (
                      <li key={child.id}>
                        <Link href={"/c/" + child.slug} aria-current={on ? "page" : undefined} className={"block rounded-lg px-1 py-1.5 text-center text-[10.5px] leading-tight transition lg:px-2.5 lg:text-left lg:text-[13px] " + (on ? "bg-white font-semibold text-brand-600 shadow-card" : "text-slate-600 hover:bg-white/70 hover:text-slate-950")}>
                          {child.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function CatalogView({ category, rail = [] }: { category?: FixedCategory; rail?: RailCategory[] }) {
  // Header search and old category links arrive as ?q= / ?categoryId=.
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const categoryId = category?.id ?? searchParams.get("categoryId") ?? "";
  const [items, setItems] = useState<Product[]>([]);
  const [sort, setSort] = useState("featured");
  const [query, setQuery] = useState(urlQuery);
  useEffect(() => { setQuery(urlQuery); }, [urlQuery]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "48", sort });
      if (categoryId) params.set("categoryId", categoryId);
      if (search.trim()) params.set("q", search.trim());
      if (minPrice) params.set("minPrice", String(Number(minPrice) * 100));
      if (maxPrice) params.set("maxPrice", String(Number(maxPrice) * 100));
      const response = await fetch("/api/v1/catalog/products?" + params.toString(), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to load products.");
      setItems(body.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, [categoryId, sort, minPrice, maxPrice]);

  useEffect(() => { void load(query); }, [load, query]);

  const title = query ? `Results for “${query}”` : category?.name ?? rail.find((c) => c.id === categoryId)?.name ?? "All products";
  const control = "h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-slate-900";

  return (
    <main className="min-h-[60vh] bg-canvas px-3 py-5 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-900">Home</Link><span className="mx-1.5">/</span>
          {category ? <><Link href="/products" className="hover:text-slate-900">Shop</Link><span className="mx-1.5">/</span></> : null}
          {category?.parent ? <><Link href={"/c/" + category.parent.slug} className="hover:text-slate-900">{category.parent.name}</Link><span className="mx-1.5">/</span></> : null}
          <span className="text-slate-900">{category?.name ?? "Shop"}</span>
        </nav>

        <div className={"mt-3 grid gap-3 sm:gap-6 lg:mt-5 lg:gap-8 " + (rail.length ? "grid-cols-[76px_minmax(0,1fr)] sm:grid-cols-[96px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)]" : "")}>
          {rail.length ? <aside><CategoryRail rail={rail} activeId={categoryId} /></aside> : null}

          <section aria-label="Products" className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.03em] sm:text-[34px]">{title}</h1>
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">{loading ? "Loading products…" : `${items.length} product${items.length === 1 ? "" : "s"} from verified sellers`}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={sort} onChange={(e) => setSort(e.target.value)} className={control} aria-label="Sort products">
                  {SORTS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
                <input inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))} placeholder="Min ₹" className={control + " w-[4.5rem]"} aria-label="Minimum price" />
                <input inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))} placeholder="Max ₹" className={control + " w-[4.5rem]"} aria-label="Maximum price" />
              </div>
            </div>

            {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

            {loading ? (
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-3"><div className="aspect-square rounded-xl bg-slate-100" /><div className="mt-3 h-4 rounded bg-slate-100" /><div className="mt-2 h-4 w-2/3 rounded bg-slate-100" /></div>)}</div>
            ) : items.length === 0 ? (
              <div className="mt-6 rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center sm:p-12"><p className="text-lg font-bold sm:text-xl">No matching products yet.</p><p className="mt-2 text-sm text-slate-500">Try another category, a different search, or clear the price filter.</p><Link href="/products" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">See all products</Link></div>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {items.map((product) => {
                  const variant = [...product.variants].sort((a, b) => a.pricePaise - b.pricePaise)[0];
                  const image = product.media?.find((media) => media.kind === "IMAGE" && media.storageKey);
                  return (
                    <ProductCard
                      key={product.id}
                      product={{ id: product.id, slug: product.slug, title: product.title, pricePaise: variant?.pricePaise ?? 0, compareAtPaise: variant?.compareAtPaise, mediaStorageKey: image?.storageKey, mediaAltText: image?.altText, sellerName: product.sellerName, reviewCount: product.reviewCount, ratingTotal: product.ratingTotal }}
                    />
                  );
                })}
              </div>
            )}
            {category?.intro ? (
              <section aria-labelledby="category-about" className="mt-10 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-7">
                <h2 id="category-about" className="text-base font-semibold sm:text-lg">About {category.name}</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">{category.intro}</p>
              </section>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
