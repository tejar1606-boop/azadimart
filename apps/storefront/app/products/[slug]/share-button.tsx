"use client";

import { useEffect, useRef, useState } from "react";

type Channel = { name: string; href: (url: string, text: string) => string; className: string; icon: React.ReactNode };

const svg = (path: React.ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{path}</svg>;
const CHANNELS: Channel[] = [
  { name: "WhatsApp", className: "bg-[#25d366] text-white", href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}`, icon: svg(<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z" />) },
  { name: "Facebook", className: "bg-[#1877f2] text-white", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`, icon: svg(<path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.4a22 22 0 0 0-2.5-.1c-2.4 0-4.1 1.5-4.1 4.2v2.3H7.5V14h2.7v8h3.3Z" />) },
  { name: "X", className: "bg-black text-white", href: (u, t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}`, icon: svg(<path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />) },
  { name: "Telegram", className: "bg-[#229ed9] text-white", href: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`, icon: svg(<path d="M21.5 4.2 18.4 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2L6.5 13 1.9 11.6c-1-.3-1-1 .2-1.5l18-6.9c.8-.3 1.6.2 1.4 1Z" />) },
  { name: "Email", className: "bg-slate-700 text-white", href: (u, t) => `mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(`${t}\n${u}`)}`, icon: svg(<path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 7.7L4 7.2V17h16V7.2l-8 5.5ZM5.2 7 12 11.6 18.8 7H5.2Z" />) },
];

/** Adds where a visit came from (e.g. utm_source=whatsapp) so shared traffic can be measured later. */
const tagged = (url: string, source: string) => { const u = new URL(url); u.searchParams.set("utm_source", source); u.searchParams.set("utm_medium", "share"); return u.toString(); };

/**
 * Share a product. Phones open the native share sheet (WhatsApp, Instagram,
 * Telegram…); other devices get a menu with popular apps and Copy link.
 */
export default function ShareButton({ path, title, pricePaise }: { path: string; title: string; pricePaise: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const price = "₹" + (pricePaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const text = `Check out ${title} for ${price} on AzadiMart`;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  async function share() {
    const url = window.location.origin + path;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try { await navigator.share({ title, text, url: tagged(url, "native") }); return; } catch { /* cancelled or blocked: fall back to the menu */ }
    }
    setOpen((v) => !v);
  }

  async function copy() {
    const url = tagged(window.location.origin + path, "copy");
    try { await navigator.clipboard.writeText(url); } catch {
      const input = document.createElement("input"); input.value = url; document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div ref={box} className="relative inline-block">
      <button type="button" onClick={() => void share()} aria-haspopup="menu" aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></svg>
        Share
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-[310px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-lift sm:left-0 sm:right-auto">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Share this product</p>
          <div className="grid grid-cols-5 gap-2">
            {CHANNELS.map((c) => (
              <a key={c.name} role="menuitem" href={c.href(tagged(window.location.origin + path, c.name.toLowerCase()), text)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="flex min-w-0 flex-col items-center gap-1 text-[10px] font-medium leading-tight text-slate-600" aria-label={`Share on ${c.name}`}>
                <span className={"grid h-10 w-10 place-items-center rounded-full " + c.className}>{c.icon}</span>{c.name}
              </a>
            ))}
          </div>
          <button type="button" role="menuitem" onClick={() => void copy()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-sm font-semibold hover:border-slate-900">
            {copied ? "✓ Link copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
