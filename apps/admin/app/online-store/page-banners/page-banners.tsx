"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import { PAGE_BANNER_DESKTOP, PAGE_BANNER_MOBILE } from "@azadimart/shared";
import MediaField from "../media-field";

type Banner = { pageKey: string; desktopImageUrl: string; mobileImageUrl: string | null; href: string | null; alt: string; isActive: boolean; startsAt: string | null; endsAt: string | null; updatedAt: string };
type PageRow = { key: string; label: string; path: string; group: string; parentKey: string | null; banner: Banner | null };
type Form = { desktopImageUrl: string; mobileImageUrl: string; href: string; alt: string; isActive: boolean; startsAt: string; endsAt: string };

const EMPTY: Form = { desktopImageUrl: "", mobileImageUrl: "", href: "", alt: "", isActive: true, startsAt: "", endsAt: "" };
// <input type="datetime-local"> works in local time; the API takes ISO with offset.
const toLocal = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

function status(b: Banner | null) {
  if (!b) return { label: "No banner", tone: "bg-slate-100 text-slate-500" };
  const now = Date.now();
  if (!b.isActive) return { label: "Off", tone: "bg-slate-200 text-slate-600" };
  if (b.startsAt && new Date(b.startsAt).getTime() > now) return { label: "Scheduled", tone: "bg-sky-50 text-sky-700" };
  if (b.endsAt && new Date(b.endsAt).getTime() <= now) return { label: "Ended", tone: "bg-amber-50 text-amber-800" };
  return { label: "Live", tone: "bg-green-50 text-green-700" };
}

export default function PageBanners() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [selected, setSelected] = useState<string>("shop");
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const body = await fetch("/api/v1/page-banners", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setPages(body?.pages ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const page = pages.find((p) => p.key === selected);
  useEffect(() => {
    const b = page?.banner;
    setForm(b ? { desktopImageUrl: b.desktopImageUrl, mobileImageUrl: b.mobileImageUrl ?? "", href: b.href ?? "", alt: b.alt, isActive: b.isActive, startsAt: toLocal(b.startsAt), endsAt: toLocal(b.endsAt) } : EMPTY);
    setMessage(null);
  }, [page?.key, page?.banner]);

  const parent = useMemo(() => pages.find((p) => p.key === page?.parentKey), [pages, page]);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/v1/page-banners", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        pageKey: selected, desktopImageUrl: form.desktopImageUrl, mobileImageUrl: form.mobileImageUrl || null, href: form.href || null, alt: form.alt,
        isActive: form.isActive, startsAt: toIso(form.startsAt), endsAt: toIso(form.endsAt),
      }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't save the banner");
      setMessage({ ok: true, text: "Saved. It's on the store now" + (form.isActive ? "" : " (switched off)") + "." });
      await load();
    } catch (err) { setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save the banner" }); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm("Remove this page's banner?")) return;
    setBusy(true);
    await fetch("/api/v1/page-banners?pageKey=" + encodeURIComponent(selected), { method: "DELETE" });
    setBusy(false); setMessage({ ok: true, text: "Banner removed." }); await load();
  }

  const field = "mt-1 w-full rounded-lg border p-2.5 text-sm";
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Storefront" title="Page banners" description={`A banner at the top of a page. Desktop ${PAGE_BANNER_DESKTOP.width} × ${PAGE_BANNER_DESKTOP.height} px, mobile ${PAGE_BANNER_MOBILE.width} × ${PAGE_BANNER_MOBILE.height} px.`} />
      <div className="mt-6 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <nav aria-label="Pages" className="h-fit rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {["Pages", "Categories"].map((group) => (
            <div key={group} className="py-1">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{group}</p>
              {pages.filter((p) => p.group === group).map((p) => {
                const st = status(p.banner);
                return (
                  <button key={p.key} type="button" onClick={() => setSelected(p.key)} className={"flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm " + (selected === p.key ? "bg-orange-50 ring-1 ring-brand" : "hover:bg-slate-50")}>
                    <span className="h-7 w-16 shrink-0 rounded bg-slate-100 bg-cover bg-center" style={p.banner ? { backgroundImage: `url("${p.banner.desktopImageUrl}")` } : undefined} />
                    <span className="min-w-0 flex-1 leading-tight"><span className="block font-medium">{p.label}</span><span className="block text-[11px] text-slate-400">{p.path}</span></span>
                    <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold " + st.tone}>{st.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {page ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{page.label.replace(/^— /, "")}</h2>
                <p className="text-xs text-slate-500">Shows at the top of {page.path}</p>
              </div>
              <span className={"rounded-full px-2.5 py-1 text-[11px] font-bold " + status(page.banner).tone}>{status(page.banner).label}</span>
            </div>
            {page.key.startsWith("category:") && !page.parentKey ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Its sub-categories show this banner too, unless they have their own.</p> : null}
            {parent && !page.banner ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{parent.banner ? `Showing ${parent.label}'s banner until you add one here.` : `No banner on ${parent.label} either, so this page has none.`}</p> : null}

            {/* Live preview: updates as soon as an image is uploaded or changed. */}
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live preview</p><p className="text-[11px] text-slate-500">{form.isActive ? "Will show on the store" : "Switched off: not shown on the store"}</p></div>
              <div className="mt-2 grid gap-3 md:grid-cols-[1fr_190px] md:items-end">
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-slate-500">Desktop · {PAGE_BANNER_DESKTOP.width} × {PAGE_BANNER_DESKTOP.height}</p>
                  <span className={"grid place-items-center overflow-hidden rounded-lg bg-white bg-cover bg-center text-xs text-slate-400 ring-1 ring-slate-200 " + (form.isActive ? "" : "opacity-50")} style={{ aspectRatio: `${PAGE_BANNER_DESKTOP.width} / ${PAGE_BANNER_DESKTOP.height}`, ...(form.desktopImageUrl ? { backgroundImage: `url("${form.desktopImageUrl}")` } : {}) }}>{form.desktopImageUrl ? null : "Upload the desktop banner below"}</span>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-slate-500">Phone · {PAGE_BANNER_MOBILE.width} × {PAGE_BANNER_MOBILE.height}</p>
                  <span className={"grid place-items-center overflow-hidden rounded-lg bg-white bg-cover bg-center px-2 text-center text-[11px] text-slate-400 ring-1 ring-slate-200 " + (form.isActive ? "" : "opacity-50")} style={{ aspectRatio: form.mobileImageUrl || !form.desktopImageUrl ? `${PAGE_BANNER_MOBILE.width} / ${PAGE_BANNER_MOBILE.height}` : `${PAGE_BANNER_DESKTOP.width} / ${PAGE_BANNER_DESKTOP.height}`, ...(form.mobileImageUrl || form.desktopImageUrl ? { backgroundImage: `url("${form.mobileImageUrl || form.desktopImageUrl}")` } : {}) }}>{form.mobileImageUrl || form.desktopImageUrl ? null : "Upload the mobile banner below"}</span>
                </div>
              </div>
              {form.desktopImageUrl && !form.mobileImageUrl ? <p className="mt-2 text-[11px] text-amber-700">No mobile banner yet: phones show the thin desktop banner. Add an 800 × 329 one for a better look.</p> : null}
            </div>

            <div className="mt-4 grid gap-4">
              <MediaField kind="image" label="Desktop banner" hint={`${PAGE_BANNER_DESKTOP.width} × ${PAGE_BANNER_DESKTOP.height} px`} size={PAGE_BANNER_DESKTOP} value={form.desktopImageUrl} onChange={(v) => setForm((f) => ({ ...f, desktopImageUrl: v }))} />
              <MediaField kind="image" label="Mobile banner (recommended)" hint={`${PAGE_BANNER_MOBILE.width} × ${PAGE_BANNER_MOBILE.height} px · without it, phones show the desktop banner`} size={PAGE_BANNER_MOBILE} value={form.mobileImageUrl} onChange={(v) => setForm((f) => ({ ...f, mobileImageUrl: v }))} />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">Link (optional)<input className={field} placeholder="/c/fashion or https://…" value={form.href} onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))} /><span className="mt-1 block text-xs font-normal text-slate-500">Leave empty for a banner that isn&apos;t clickable.</span></label>
                <label className="text-sm font-medium">Describe the banner<input className={field} maxLength={160} placeholder="e.g. Festive sale on ethnic wear" value={form.alt} onChange={(e) => setForm((f) => ({ ...f, alt: e.target.value }))} /><span className="mt-1 block text-xs font-normal text-slate-500">Read aloud by screen readers.</span></label>
                <p className="text-sm font-semibold md:col-span-2">Schedule <span className="font-normal text-slate-500">(optional, e.g. for a sale)</span></p>
                <label className="text-sm font-medium">Start showing<input type="datetime-local" className={field} value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} /></label>
                <label className="text-sm font-medium">Stop showing<input type="datetime-local" className={field} value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} /></label>
              </div>
              <label className="flex w-fit items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 accent-[#ff9933]" />Show this banner</label>


              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={busy || !form.desktopImageUrl} onClick={() => void save()} className="rounded-full bg-chrome px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : "Save banner"}</button>
                {page.banner ? <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-full px-4 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-200">Remove banner</button> : null}
                {message ? <p role="status" className={"text-sm " + (message.ok ? "text-green-700" : "text-red-700")}>{message.text}</p> : null}
              </div>
            </div>
          </section>
        ) : <div className="h-64 animate-pulse rounded-2xl bg-white" />}
      </div>
    </main>
  );
}
