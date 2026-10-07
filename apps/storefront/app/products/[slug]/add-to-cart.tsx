"use client";

import Link from "next/link";
import { useState } from "react";

export default function AddToCart({ variantId, availableQuantity }: { variantId: string; availableQuantity: number }) {
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function add() {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/v1/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Please sign in to add items to your cart.");
      setMessage("Added to your cart.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add to cart.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setQuantity((v) => Math.max(1, v - 1))} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200" aria-label="Decrease quantity">−</button>
        <span className="min-w-8 text-center text-sm font-bold">{quantity}</span>
        <button type="button" onClick={() => setQuantity((v) => Math.min(availableQuantity, v + 1))} disabled={quantity >= availableQuantity} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 disabled:opacity-40" aria-label="Increase quantity">+</button>
      </div>
      <button type="button" onClick={() => void add()} disabled={busy || availableQuantity < 1} className="mt-4 w-full rounded-full bg-slate-950 px-5 py-3.5 text-sm font-black text-white disabled:opacity-50">
        {busy ? "Adding…" : availableQuantity > 0 ? "Add to cart" : "Out of stock"}
      </button>
      {message ? <Link href="/cart" className="mt-3 block text-center text-sm font-semibold text-amber-700">{message} View cart →</Link> : null}
      {error ? <p className="mt-3 text-center text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
