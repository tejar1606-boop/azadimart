"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import SignInPrompt from "../../components/sign-in-prompt";

export default function AddToCart({ variantId, availableQuantity }: { variantId: string; availableQuantity: number }) {
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [signInNext, setSignInNext] = useState("");
  const resumed = useRef(false);

  const add = useCallback(async (qty: number) => {
    setBusy(true); setMessage(""); setError(""); setSignInNext("");
    try {
      const response = await fetch("/api/v1/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity: qty }),
      });
      if (response.status === 401) {
        // Come back to this product after signing in, and finish adding it.
        setSignInNext(`${window.location.pathname}?add=${variantId}&qty=${qty}`);
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to add to cart.");
      setMessage(`Added ${qty > 1 ? `${qty} items ` : ""}to your cart.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add to cart.");
    } finally {
      setBusy(false);
    }
  }, [variantId]);

  // Back from signing in with ?add=…: add the item the shopper wanted, once.
  useEffect(() => {
    if (resumed.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("add") !== variantId) return;
    resumed.current = true;
    const qty = Math.max(1, Math.min(availableQuantity, Number(params.get("qty")) || 1));
    setQuantity(qty);
    params.delete("add"); params.delete("qty");
    window.history.replaceState(null, "", window.location.pathname + (params.size ? "?" + params : "") + window.location.hash);
    void add(qty);
  }, [add, availableQuantity, variantId]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setQuantity((v) => Math.max(1, v - 1))} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200" aria-label="Decrease quantity">−</button>
        <span className="min-w-8 text-center text-sm font-bold">{quantity}</span>
        <button type="button" onClick={() => setQuantity((v) => Math.min(availableQuantity, v + 1))} disabled={quantity >= availableQuantity} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 disabled:opacity-40" aria-label="Increase quantity">+</button>
      </div>
      <button type="button" onClick={() => void add(quantity)} disabled={busy || availableQuantity < 1} className="mt-4 w-full rounded-full bg-brand px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:bg-slate-300">
        {busy ? "Adding…" : availableQuantity > 0 ? "Add to cart" : "Out of stock"}
      </button>
      {message ? <Link href="/cart" className="mt-3 block text-center text-sm font-semibold text-amber-700">{message} View cart →</Link> : null}
      {signInNext ? <SignInPrompt className="mt-3" title="Sign in to add this to your cart" text="It takes a few seconds. We'll bring you back here and add it for you." next={signInNext} /> : null}
      {error ? <p className="mt-3 text-center text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
