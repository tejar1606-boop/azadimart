"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ProductCard from "../components/product-card";

type Variant = { id: string; title: string; pricePaise: number; compareAtPaise: number | null; availableQuantity: number };
type Category = { id: string; name: string; slug: string; parentId?: string | null };
/** Set on a category page (/c/<slug>): the category is fixed and shown as the page title. */
export type FixedCategory = { id: string; name: string; slug: string; parent: { name: string; slug: string } | null; children: Array<{ name: string; slug: string }> };
type Product = { id: string; title: string; slug: string; description: string | null; categoryName: string; sellerName: string; variants: Variant[]; media?: Array<{ storageKey:string; kind:string; altText:string|null }> };

export default function CatalogView({ category }: { category?: FixedCategory }) {
  const router = useRouter();
  // Header search and category links arrive as ?q= / ?categoryId=.
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlCategory = category?.id ?? searchParams.get("categoryId") ?? "";
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(urlCategory);
  const [sort, setSort] = useState("featured");
  const [query, setQuery] = useState(urlQuery);
  useEffect(() => { setQuery(urlQuery); }, [urlQuery]);
  useEffect(() => { setCategoryId(urlCategory); }, [urlCategory]);
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
      setCategories(body.categories ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, [categoryId, sort, minPrice, maxPrice]);

  useEffect(() => { void load(query); }, [load, query]);

  return (
    <main className="min-h-[60vh] bg-canvas px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
              <Link href="/" className="hover:text-slate-900">Home</Link><span className="mx-1.5">/</span>
              {category ? <><Link href="/products" className="hover:text-slate-900">Shop</Link><span className="mx-1.5">/</span></> : null}
              {category?.parent ? <><Link href={"/c/" + category.parent.slug} className="hover:text-slate-900">{category.parent.name}</Link><span className="mx-1.5">/</span></> : null}
              <span className="text-slate-900">{category?.name ?? "Shop"}</span>
            </nav>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] sm:text-[40px]">{query ? `Results for “${query}”` : category?.name ?? categories.find((c) => c.id === categoryId)?.name ?? "All products"}</h1>
            <p className="mt-1 text-sm text-slate-500">{loading ? "Loading products…" : `${items.length} product${items.length === 1 ? "" : "s"} from verified sellers`}</p>
            {category?.children.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-950 px-3.5 py-1.5 text-xs font-semibold text-white">All {category.name}</span>
                {category.children.map((child) => <Link key={child.slug} href={"/c/" + child.slug} className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-900">{child.name}</Link>)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:hidden">
          <select value={categoryId} onChange={(event) => { const next = categories.find((c) => c.id === event.target.value); router.push(next ? "/c/" + next.slug : "/products"); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none" aria-label="Filter by category"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>)}</select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none" aria-label="Sort products"><option value="featured">Featured</option><option value="newest">Newest</option><option value="price_asc">Price: Low to high</option><option value="price_desc">Price: High to low</option></select>
          <div className="grid grid-cols-2 gap-2"><input inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))} placeholder="Min ₹" className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none" aria-label="Minimum price"/><input inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))} placeholder="Max ₹" className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none" aria-label="Maximum price"/></div>
        </div>

        <div className="mt-8 flex items-center justify-between text-sm">
          <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-slate-500">
            <select value={categoryId} onChange={(event) => { const next = categories.find((c) => c.id === event.target.value); router.push(next ? "/c/" + next.slug : "/products"); }} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold outline-none" aria-label="Desktop category filter"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>)}</select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold outline-none" aria-label="Desktop sort"><option value="featured">Featured</option><option value="newest">Newest</option><option value="price_asc">Price low</option><option value="price_desc">Price high</option></select>
            <input inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))} placeholder="Min ₹" className="w-20 rounded-full border border-slate-200 px-3 py-1.5 outline-none" aria-label="Minimum price"/>
            <input inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))} placeholder="Max ₹" className="w-20 rounded-full border border-slate-200 px-3 py-1.5 outline-none" aria-label="Maximum price"/>
            <button type="button" onClick={() => setSort("featured")} className={"rounded-full px-3 py-1.5 transition " + (sort === "featured" ? "bg-slate-950 text-white" : "border border-slate-200 hover:border-slate-300")}>Featured</button>
            <button type="button" onClick={() => setSort("newest")} className={"rounded-full px-3 py-1.5 transition " + (sort === "newest" ? "bg-slate-950 text-white" : "border border-slate-200 hover:border-slate-300")}>Latest</button>
            <button type="button" onClick={() => setSort("price_asc")} className={"rounded-full px-3 py-1.5 transition " + (sort === "price_asc" ? "bg-slate-950 text-white" : "border border-slate-200 hover:border-slate-300")}>Price low</button>
            <button type="button" onClick={() => setSort("price_desc")} className={"rounded-full px-3 py-1.5 transition " + (sort === "price_desc" ? "bg-slate-950 text-white" : "border border-slate-200 hover:border-slate-300")}>Price high</button>
          </div>
        </div>

        {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-3"><div className="aspect-square rounded-xl bg-slate-100"/><div className="mt-3 h-4 rounded bg-slate-100"/><div className="mt-2 h-4 w-2/3 rounded bg-slate-100"/></div>)}</div>
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-xl font-bold">No matching products yet.</p><p className="mt-2 text-sm text-slate-500">Try a different search or return to the homepage.</p><Link href="/" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Back home</Link></div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((product) => {
              const variant = [...product.variants].sort((a, b) => a.pricePaise - b.pricePaise)[0];
              const image = product.media?.find((media) => media.kind === "IMAGE" && media.storageKey);
              return (
                <ProductCard
                  key={product.id}
                  product={{ id: product.id, slug: product.slug, title: product.title, pricePaise: variant?.pricePaise ?? 0, compareAtPaise: variant?.compareAtPaise, mediaStorageKey: image?.storageKey, mediaAltText: image?.altText, sellerName: product.sellerName }}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
