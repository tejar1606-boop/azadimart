"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";

type Item = { id: string; title: string; status: string; sellerName: string; updatedAt: string; coverImageUrl: string | null; pricePaise: number | null; available: number };
const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const TABS: Array<[string, string]> = [["", "All"], ["LIVE", "Live"], ["UNLISTED", "Hidden"], ["PENDING_QC", "In QC"], ["PENDING_ADMIN_APPROVAL", "Awaiting approval"], ["DRAFT", "Drafts"], ["QC_REJECTED", "Needs changes"], ["ARCHIVED", "Archived"]];
const TONE: Record<string, string> = { LIVE: "bg-green-50 text-green-700", UNLISTED: "bg-slate-200 text-slate-700", ARCHIVED: "bg-slate-100 text-slate-400", QC_REJECTED: "bg-red-50 text-red-700", PENDING_QC: "bg-amber-50 text-amber-800", PENDING_ADMIN_APPROVAL: "bg-amber-50 text-amber-800", DRAFT: "bg-slate-100 text-slate-700" };

export default function CatalogPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search) params.set("q", search);
    fetch("/api/v1/catalog/products?" + params.toString(), { cache: "no-store" })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.message ?? "Could not load products"); setItems(b.items); setError(""); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, search]);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Catalogue" title="All products" description="Every product across sellers. Only AzadiMart admins can edit or delete products." />
      <form onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); }} className="mt-6 flex max-w-xl gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, SKU or seller" className="h-11 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-900" />
        <button className="rounded-full bg-chrome px-5 text-sm font-semibold text-white">Search</button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button key={key || "all"} type="button" onClick={() => setStatus(key)} className={"rounded-full px-3.5 py-1.5 text-xs font-semibold " + (status === key ? "bg-chrome text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900")}>{label}</button>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        {error ? <p className="p-5 text-sm text-red-600">{error}</p> : loading ? <p className="p-5 text-sm text-slate-500">Loading…</p> : items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No products found.</p> : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id}>
                <Link href={"/catalog/" + item.id} className="flex items-center gap-4 px-4 py-3 transition hover:bg-panel sm:px-5">
                  <div className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 bg-slate-100 bg-cover bg-center" style={item.coverImageUrl ? { backgroundImage: `url("${item.coverImageUrl}")` } : undefined} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.sellerName} · {item.pricePaise !== null ? money(item.pricePaise) : "No price"} · {item.available === 0 ? <span className="font-semibold text-red-600">Out of stock</span> : `${item.available} in stock`}</p>
                  </div>
                  <span className={"hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline " + (TONE[item.status] ?? "bg-slate-100")}>{item.status.replaceAll("_", " ").toLowerCase()}</span>
                  <span className="shrink-0 text-sm font-semibold text-brand-600">Edit →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
