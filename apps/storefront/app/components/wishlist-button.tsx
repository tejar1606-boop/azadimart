"use client";

import { useEffect, useState } from "react";
import { HeartIcon } from "./icons";

// One wishlist request per page load, shared by every button on the page.
let savedIds: Promise<Set<string>> | null = null;
function loadSavedIds(): Promise<Set<string>> {
  savedIds ??= fetch("/api/v1/wishlist", { cache: "no-store" })
    .then(async (response) => (response.ok ? new Set<string>(((await response.json()).items ?? []).map((item: { id: string }) => item.id)) : new Set<string>()))
    .catch(() => new Set<string>());
  return savedIds;
}

export default function WishlistButton({ productId }: { productId: string }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void loadSavedIds().then((ids) => { if (active) setSaved(ids.has(productId)); });
    return () => { active = false; };
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
      if (response.status === 401) { window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname + window.location.search); return; }
      if (!response.ok) return;
      const body = await response.json();
      const ids = new Set<string>((body.items ?? []).map((item: { id: string }) => item.id));
      savedIds = Promise.resolve(ids);
      setSaved(ids.has(productId));
    } finally { setBusy(false); }
  }

  return <button type="button" aria-label={saved ? "Remove from wishlist" : "Save to wishlist"} aria-pressed={saved} disabled={busy} onClick={toggle} className={"absolute right-2.5 top-2.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow-sm transition hover:scale-105 disabled:opacity-60 " + (saved ? "text-brand-600" : "text-slate-700")}><HeartIcon size={18} filled={saved} /></button>;
}