"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  title: string;
  slug: string;
  sellerName: string;
  status: string;
  createdAt: string;
  variants: Array<{
    id: string;
    sku: string;
    title: string;
    pricePaise: number;
    weightGrams: number;
    isActive: boolean;
  }>;
};

export default function Page() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v1/products", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to load products.");
      setItems(body.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }

  async function decide(productId: string, decision: "APPROVED" | "REJECTED") {
    setBusy(productId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, decision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Product approval failed.");
      setMessage(decision === "APPROVED" ? "Product approved and is now LIVE." : "Product rejected and returned to QC.");
      setItems((current) => current.filter((item) => item.id !== productId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Product approval failed.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div>
        <p className="text-sm uppercase tracking-wide text-ink-muted">Marketplace operations</p>
        <h1 className="mt-1 text-3xl font-semibold">Product approval</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-muted">
          Final admin approval after QC. Only approved LIVE products can appear on the customer storefront.
        </p>
      </div>

      {error ? <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-5 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-4">
          <h2 className="font-semibold">Awaiting approval ({items.length})</h2>
        </div>

        {loading ? (
          <p className="px-4 py-8 text-sm text-ink-muted">Loading products…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink-muted">No products are waiting for final approval.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {items.map((item) => (
              <article key={item.id} className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-ink-muted">Seller: {item.sellerName} · SKU variants: {item.variants.length}</p>
                    <div className="mt-3 space-y-2">
                      {item.variants.map((variant) => (
                        <div key={variant.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                          <span className="font-medium">{variant.title}</span>
                          <span className="ml-2 text-ink-muted">{variant.sku} · ₹{(variant.pricePaise / 100).toFixed(2)} · {variant.weightGrams} g</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy === item.id}
                      onClick={() => void decide(item.id, "APPROVED")}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Approve & go LIVE
                    </button>
                    <button
                      type="button"
                      disabled={busy === item.id}
                      onClick={() => void decide(item.id, "REJECTED")}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
