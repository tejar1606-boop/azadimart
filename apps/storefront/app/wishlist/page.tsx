"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { id: string; title: string; slug: string; pricePaise: number; mediaStorageKey: string | null; mediaAltText: string | null };
const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function WishlistPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/v1/wishlist", { cache: "no-store" });
      const body = await response.json();
      if (response.status === 401) { setSignedOut(true); return; }
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to load wishlist.");
      setItems(body.items ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load wishlist."); }
    finally { setLoading(false); }
  }

  async function remove(productId: string) {
    const response = await fetch("/api/v1/wishlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) });
    if (response.ok) setItems((await response.json()).items ?? []);
  }

  useEffect(() => { void load(); }, []);

  if (signedOut) return <main className="min-h-[60vh] bg-canvas px-4 py-12"><div className="mx-auto max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 text-center"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600">Wishlist</p><h1 className="mt-2 text-3xl font-bold">Sign in to save products.</h1><Link href="/login?next=%2Fwishlist" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Sign in</Link></div></main>;

  return <main className="min-h-[60vh] bg-canvas px-4 py-8 sm:px-6 sm:py-12"><div className="mx-auto max-w-[1440px]">
    <div className="flex items-end justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600">Saved for later</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Your wishlist.</h1><p className="mt-2 text-sm text-slate-500">{items.length} saved {items.length === 1 ? "product" : "products"}</p></div><Link href="/products" className="text-sm font-bold text-slate-500">Continue shopping →</Link></div>
    {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
    {loading ? <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({length:5}).map((_,i)=><div key={i} className="aspect-[.78] animate-pulse rounded-2xl bg-white"/>)}</div> :
    items.length === 0 ? <div className="mt-8 rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-xl font-bold">Nothing saved yet.</p><p className="mt-2 text-sm text-slate-500">Tap the heart on products you want to revisit.</p><Link href="/products" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Explore products</Link></div> :
    <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{items.map(item=><article key={item.id} className="group rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm"><Link href={"/products/"+item.slug}><div className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">{item.mediaStorageKey ? <Image src={"/media/"+item.mediaStorageKey} alt={item.mediaAltText ?? item.title} fill sizes="(max-width:640px) 50vw, 20vw" className="object-cover transition group-hover:scale-105"/> : <span className="grid h-full place-items-center text-4xl font-bold text-slate-200">{item.title.slice(0,1)}</span>}</div><p className="mt-3 line-clamp-2 text-sm font-semibold">{item.title}</p><p className="mt-1 font-bold">{money(item.pricePaise)}</p></Link><button type="button" onClick={()=>void remove(item.id)} className="mt-3 w-full rounded-full border border-slate-200 py-2 text-xs font-bold text-slate-600 hover:border-red-200 hover:text-red-600">Remove</button></article>)}</div>}
  </div></main>;
}