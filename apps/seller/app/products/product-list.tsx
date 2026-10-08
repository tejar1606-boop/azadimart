"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Product = { id: string; title: string; status: string; slug: string; createdAt: string; coverImageUrl: string | null; pricePaise: number | null; available: number };
type Action = "submit" | "unlist" | "relist" | "withdraw";

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "bg-slate-100 text-slate-700" },
  PENDING_QC: { label: "In QC review", tone: "bg-amber-50 text-amber-800" },
  QC_REJECTED: { label: "Needs changes", tone: "bg-red-50 text-red-700" },
  PENDING_ADMIN_APPROVAL: { label: "Awaiting approval", tone: "bg-amber-50 text-amber-800" },
  LIVE: { label: "Live", tone: "bg-green-50 text-green-700" },
  UNLISTED: { label: "Hidden from store", tone: "bg-slate-200 text-slate-700" },
  ARCHIVED: { label: "Removed by AzadiMart", tone: "bg-slate-100 text-slate-400" },
};

const TABS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: "all", label: "All", statuses: ["DRAFT", "PENDING_QC", "QC_REJECTED", "PENDING_ADMIN_APPROVAL", "LIVE", "UNLISTED"] },
  { key: "live", label: "Live", statuses: ["LIVE"] },
  { key: "drafts", label: "Drafts", statuses: ["DRAFT", "QC_REJECTED"] },
  { key: "review", label: "In review", statuses: ["PENDING_QC", "PENDING_ADMIN_APPROVAL"] },
  { key: "hidden", label: "Hidden", statuses: ["UNLISTED"] },
  { key: "removed", label: "Removed", statuses: ["ARCHIVED"] },
];

/** Which actions a product offers in each status (mirrors the server rules). Removing products is admin-only. */
function actionsFor(status: string): Array<{ action: Action; label: string; primary?: boolean }> {
  switch (status) {
    case "DRAFT": case "QC_REJECTED": return [{ action: "submit", label: "Submit for QC", primary: true }];
    case "PENDING_QC": case "PENDING_ADMIN_APPROVAL": return [{ action: "withdraw", label: "Move to draft" }];
    case "LIVE": return [{ action: "unlist", label: "Hide from store" }];
    case "UNLISTED": return [{ action: "relist", label: "Show on store", primary: true }];
    default: return [];
  }
}

const SUCCESS: Record<Action, string> = {
  submit: "submitted for QC.",
  unlist: "is hidden from the store.",
  relist: "is live on the store again.",
  withdraw: "moved back to drafts.",
};

export default function ProductList() {
  const [items, setItems] = useState<Product[]>([]);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/v1/products", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to load products.");
      setItems(body.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load products.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function run(product: Product, action: Action) {
    setBusy(product.id); setError(""); setMessage("");
    try {
      const response = action === "submit"
        ? await fetch("/api/v1/qc-submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id }) })
        : await fetch(`/api/v1/products/${product.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Action failed.");
      setMessage(`"${product.title}" ${SUCCESS[action]}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally { setBusy(null); }
  }

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, items.filter((i) => t.statuses.includes(i.status)).length])), [items]);
  const current = TABS.find((t) => t.key === tab)!;
  const shown = items.filter((item) => current.statuses.includes(item.status));

  return (
    <section className="mt-7">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={"rounded-full px-3.5 py-1.5 text-xs font-semibold transition " + (tab === t.key ? "bg-chrome text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900")}>
            {t.label} <span className={tab === t.key ? "text-white/60" : "text-slate-400"}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        {loading ? <p className="p-8 text-sm text-slate-500">Loading catalogue…</p> : shown.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-lg font-semibold">{tab === "all" ? "No products yet." : "Nothing here."}</p>
            {tab === "all" ? <Link href="/products/new" className="mt-4 inline-flex rounded-full bg-chrome px-5 py-2.5 text-sm font-semibold text-white">Create your first product</Link> : null}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((product) => {
              const status = STATUS[product.status] ?? { label: product.status, tone: "bg-slate-100" };
              const removed = product.status === "ARCHIVED";
              return (
                <li key={product.id} className={"flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 " + (removed ? "opacity-70" : "")}>
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 bg-slate-100 bg-cover bg-center" style={product.coverImageUrl ? { backgroundImage: `url("${product.coverImageUrl}")` } : undefined} role="img" aria-label={product.coverImageUrl ? product.title : "No image"} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{product.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {product.pricePaise !== null ? money(product.pricePaise) : "No price"} · <span className={product.available === 0 ? "font-semibold text-red-600" : product.available <= 5 ? "font-semibold text-amber-700" : ""}>{product.available === 0 ? "Out of stock" : product.available + " in stock"}</span>
                      </p>
                      <span className={"mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + status.tone}>{status.label}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!removed ? <Link href={"/products/" + product.id + "/aplus"} className="rounded-full px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-slate-950">A+ content</Link> : null}
                    {removed ? <span className="text-xs text-slate-500">Contact AzadiMart support to restore</span> : null}
                    {actionsFor(product.status).map(({ action, label, primary }) => (
                      <button
                        key={action}
                        type="button"
                        disabled={busy === product.id}
                        onClick={() => void run(product, action)}
                        className={"rounded-full px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50 " + (primary ? "bg-chrome text-white hover:bg-black" : "text-slate-700 ring-1 ring-slate-300 hover:ring-slate-900")}
                      >
                        {busy === product.id ? "Working…" : label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
