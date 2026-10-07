"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CartItem = {
  id: string;
  variantId: string;
  quantity: number;
  slug: string;
  title: string;
  variantTitle: string;
  sku: string;
  pricePaise: number;
  availableQuantity: number;
  lineTotalPaise: number;
};

type CartState = {
  cartId: string;
  items: CartItem[];
  subtotalPaise: number;
  itemCount: number;
};

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function CartView() {
  const [cart, setCart] = useState<CartState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v1/cart", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to load your cart.");
      setCart(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your cart.");
    } finally {
      setLoading(false);
    }
  }

  async function mutate(item: CartItem, quantity: number | null) {
    setBusyId(item.id);
    setError("");
    try {
      const response = await fetch("/api/v1/cart", {
        method: quantity === null ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quantity === null ? { variantId: item.variantId } : { variantId: item.variantId, quantity }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to update cart.");
      setCart(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update cart.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const itemCountLabel = useMemo(() => {
    const count = cart?.itemCount ?? 0;
    return count + (count === 1 ? " item" : " items");
  }, [cart?.itemCount]);

  if (loading) {
    return <main className="min-h-screen bg-[#f8f7f3] px-4 py-12 sm:px-6"><div className="mx-auto max-w-6xl animate-pulse"><div className="h-10 w-44 rounded-xl bg-slate-200"/><div className="mt-6 h-40 rounded-3xl bg-white"/></div></main>;
  }

  if (error && !cart) {
    return <main className="min-h-screen bg-[#f8f7f3] px-4 py-16 sm:px-6"><div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center"><p className="text-sm font-semibold text-red-600">{error}</p><Link href="/products" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Continue shopping</Link></div></main>;
  }

  const items = cart?.items ?? [];
  return (
    <main className="min-h-screen bg-[#f8f7f3] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Your bag</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Shopping cart</h1><p className="mt-2 text-sm text-slate-500">{itemCountLabel}</p></div>
          <Link href="/products" className="text-sm font-semibold text-slate-600 hover:text-slate-950">Continue shopping →</Link>
        </div>

        {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {items.length === 0 ? (
          <section className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-[0_20px_60px_rgba(15,23,42,0.04)] sm:p-16">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-slate-950 text-2xl text-white">🛍</div>
            <h2 className="mt-5 text-2xl font-black">Your cart is waiting</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Explore verified products from Indian sellers and add something you love.</p>
            <Link href="/products" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">Explore products</Link>
          </section>
        ) : (
          <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_360px]">
            <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.04)]">
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.id} className="grid gap-4 p-5 sm:grid-cols-[92px_1fr_auto] sm:items-center sm:p-6">
                    <div className="grid aspect-square place-items-center rounded-2xl bg-gradient-to-br from-slate-100 via-white to-amber-50 text-3xl font-black text-slate-200" aria-hidden="true">{item.title.slice(0,1).toUpperCase()}</div>
                    <div>
                      <p className="font-bold">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.variantTitle} · {item.sku}</p>
                      <p className="mt-2 text-base font-black">{money(item.pricePaise)}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button type="button" disabled={busyId === item.id || item.quantity <= 1} onClick={() => void mutate(item, item.quantity - 1)} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-sm disabled:opacity-40">−</button>
                        <span className="min-w-8 text-center text-sm font-bold">{item.quantity}</span>
                        <button type="button" disabled={busyId === item.id || item.quantity >= item.availableQuantity} onClick={() => void mutate(item, item.quantity + 1)} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-sm disabled:opacity-40">+</button>
                        <button type="button" disabled={busyId === item.id} onClick={() => void mutate(item, null)} className="ml-2 text-xs font-semibold text-slate-500 underline hover:text-red-600">Remove</button>
                      </div>
                      <p className={`mt-2 text-xs font-medium ${item.availableQuantity <= 3 ? "text-amber-700" : "text-slate-400"}`}>{item.availableQuantity > 0 ? item.availableQuantity <= 3 ? `Only ${item.availableQuantity} left` : `${item.availableQuantity} available` : "No longer available"}</p>
                    </div>
                    <p className="text-right text-lg font-black">{money(item.lineTotalPaise)}</p>
                  </div>
                ))}
              </div>
            </section>

            <aside className="h-fit rounded-[2rem] bg-slate-950 p-6 text-white shadow-[0_25px_70px_rgba(15,23,42,0.16)] lg:sticky lg:top-28">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">Order summary</p>
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between text-white/65"><span>Subtotal</span><span>{money(cart?.subtotalPaise ?? 0)}</span></div>
                <div className="flex justify-between text-white/65"><span>Shipping</span><span>Calculated at checkout</span></div>
                <div className="flex justify-between border-t border-white/10 pt-4 text-base font-bold"><span>Total</span><span>{money(cart?.subtotalPaise ?? 0)}</span></div>
              </div>
              <Link href="/checkout" className="mt-6 flex min-h-12 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-100">Proceed to checkout</Link>
              <p className="mt-3 text-center text-[11px] text-white/45">You can review address, delivery and available payment options next.</p>
              <div className="mt-5 space-y-2 text-xs text-white/50"><p>✓ Secure payment flow</p><p>✓ Seller-level fulfillment checks</p><p>✓ Coupons applied at checkout</p></div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
