"use client";

import { useEffect, useState } from "react";

export default function WishlistButton({ productId }: { productId: string }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/v1/wishlist", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json();
      setSaved((body.items ?? []).some((item: { id: string }) => item.id === productId));
    }).catch(() => undefined);
  }, [productId]);

  async function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    try {
      const response = await fetch("/api/v1/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (response.status === 401) { window.location.href = "/login"; return; }
      if (!response.ok) return;
      const body = await response.json();
      setSaved((body.items ?? []).some((item: { id: string }) => item.id === productId));
    } finally { setBusy(false); }
  }

  return <button type="button" aria-label={saved ? "Remove from wishlist" : "Save to wishlist"} aria-pressed={saved} disabled={busy} onClick={toggle} className="absolute right-2.5 top-2.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-lg shadow-sm transition hover:scale-105 disabled:opacity-60">{saved ? "♥" : "♡"}</button>;
}