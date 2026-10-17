"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import SignInPrompt from "../../components/sign-in-prompt";

export default function AddToCart({ variantId, availableQuantity }: { variantId: string; availableQuantity: number }) {
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState<"" | "add" | "buy">("");
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [signInNext, setSignInNext] = useState("");
  const resumed = useRef(false);

  // buyNow: put exactly this quantity in the cart and go straight to checkout for just this item.
  const add = useCallback(async (qty: number, buyNow = false) => {
    setBusy(buyNow ? "buy" : "add"); setMessage(""); setError(""); setSignInNext("");
    try {
      const response = await fetch("/api/v1/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity: qty, ...(buyNow ? { replace: true } : {}) }),
      });
      if (response.status === 401) {
        // Come back to this product after signing in, and finish adding it.
        setSignInNext(`${window.location.pathname}?add=${variantId}&qty=${qty}${buyNow ? "&buy=1" : ""}`);
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Unable to add to cart.");
      if (buyNow) { router.push(`/checkout?buy=${variantId}`); return; }
      setMessage(`Added ${qty > 1 ? `${qty} items ` : ""}to your cart.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add to cart.");
    } finally {
      setBusy("");
    }
  }, [variantId, router]);

  // Back from signing in with ?add=…: add the item the shopper wanted, once.
  useEffect(() => {
    if (resumed.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("add") !== variantId) return;
    resumed.current = true;
    const qty = Math.max(1, Math.min(availableQuantity, Number(params.get("qty")) || 1));
    const buyNow = params.get("buy") === "1";
    setQuantity(qty);
    params.delete("add"); params.delete("qty"); params.delete("buy");
    window.history.replaceState(null, "", window.location.pathname + (params.size ? "?" + params : "") + window.location.hash);
    void add(qty, buyNow);
  }, [add, availableQuantity, variantId]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setQuantity((v) => Math.max(1, v - 1))} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200" aria-label="Decrease quantity">−</button>
        <span className="min-w-8 text-center text-sm font-bold">{quantity}</span>
        <button type="button" onClick={() => setQuantity((v) => Math.min(availableQuantity, v + 1))} disabled={quantity >= availableQuantity} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 disabled:opacity-40" aria-label="Increase quantity">+</button>
      </div>
      {availableQuantity > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => void add(quantity)} disabled={Boolean(busy)} className="rounded-full border-2 border-brand bg-white px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-60">
            {busy === "add" ? "Adding…" : "Add to cart"}
          </button>
          <button type="button" onClick={() => void add(quantity, true)} disabled={Boolean(busy)} className="rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60">
            {busy === "buy" ? "Please wait…" : "Buy now"}
          </button>
        </div>
      ) : (
        <button type="button" disabled className="mt-4 w-full rounded-full bg-slate-300 px-5 py-3.5 text-sm font-semibold text-white">Out of stock</button>
      )}
      {message ? <Link href="/cart" className="mt-3 block text-center text-sm font-semibold text-amber-700">{message} View cart →</Link> : null}
      {signInNext ? <SignInPrompt className="mt-3" title={signInNext.includes("buy=1") ? "Sign in to buy this" : "Sign in to add this to your cart"} text={signInNext.includes("buy=1") ? "It takes a few seconds. We'll bring you straight back to checkout." : "It takes a few seconds. We'll bring you back here and add it for you."} next={signInNext} /> : null}
      {error ? <p className="mt-3 text-center text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
