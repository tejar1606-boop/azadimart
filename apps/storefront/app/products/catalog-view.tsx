"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Variant = { id: string; title: string; pricePaise: number; compareAtPaise: number | null; availableQuantity: number };
type Product = { id: string; title: string; slug: string; description: string | null; categoryName: string; sellerName: string; variants: Variant[]; media?: Array<{ storageKey:string; kind:string; altText:string|null }> };

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function CatalogView() {
  const [items, setItems] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(search = "") {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "48" });
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch("/api/v1/catalog/products?" + params.toString(), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to load products.");
      setItems(body.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setQuery(input);
    void load(input);
  }

  return (
    <main className="min-h-screen bg-[#f8f7f3] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Marketplace</p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.045em] sm:text-6xl">Discover products.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">A curated catalog from sellers that have passed AzadiMart&apos;s onboarding and quality controls.</p>
          </div>
          <form onSubmit={submit} className="flex w-full max-w-xl gap-2 rounded-full border border-slate-200 bg-white p-1.5 shadow-sm">
            <input value={input} onChange={(event) => setInput(event.target.value)} className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none" placeholder="Search products, brands or categories" aria-label="Search products" />
            <button type="submit" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Search</button>
          </form>
        </div>

        <div className="mt-8 flex items-center justify-between text-sm">
          <p className="font-semibold">{query ? `Results for "${query}"` : "Latest on AzadiMart"}</p>
          <p className="text-slate-400">{items.length} products</p>
        </div>

        {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-3"><div className="aspect-square rounded-xl bg-slate-100"/><div className="mt-3 h-4 rounded bg-slate-100"/><div className="mt-2 h-4 w-2/3 rounded bg-slate-100"/></div>)}</div>
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-xl font-black">No matching products yet.</p><p className="mt-2 text-sm text-slate-500">Try a different search or return to the homepage.</p><Link href="/" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Back home</Link></div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((product) => {
              const variant = product.variants[0];
              return (
                <Link key={product.id} href={"/products/" + product.slug} className="group rounded-[1.35rem] border border-slate-200 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                  <div className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 via-white to-amber-50">
                    {product.media?.find(media => media.kind === "IMAGE" && media.storageKey) ? <Image src={"/media/" + product.media.find(media => media.kind === "IMAGE")!.storageKey} alt={product.media.find(media => media.kind === "IMAGE")!.altText ?? product.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" /> : <span className="text-5xl font-black tracking-[-0.06em] text-slate-200">{product.title.slice(0, 1).toUpperCase()}</span>}
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-500">Verified</span>
                  </div>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-600">{product.categoryName}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-bold leading-5">{product.title}</p>
                  <div className="mt-2 flex items-baseline gap-2"><p className="text-base font-black">{money(variant?.pricePaise ?? 0)}</p>{variant?.compareAtPaise ? <p className="text-xs text-slate-400 line-through">{money(variant.compareAtPaise)}</p> : null}</div>
                  <p className="mt-1 text-[11px] text-slate-400">{product.sellerName}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
