"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PortalPageHeader } from "@azadimart/ui";
import BannerRowField, { type RowBanner } from "../_components/banner-row-field";
import HeroSlidesField, { SLIDE_SECONDS_DEFAULT, slideStatus, slidesFromSettings, type HeroSlideSettings } from "../_components/hero-slides-field";
import MediaField from "../_components/media-field";

type Settings = Record<string, unknown>;
type Section = { position: number; type: string; isVisible: boolean; settings?: Settings };
type Device = "desktop" | "phone";

const BANNER_TYPES = new Set(["hero", "promo_banner", "banner_row"]);
// Every home section's name, so a banner card can say where it sits on the page.
const NAMES: Record<string, string> = {
  hero: "Main banner", marquee: "Offer bar", promo_banner: "Promo strip", banner_row: "Banner row", category_showcase: "Top category row",
  category_grid: "Shop by category", featured_products: "Product grid", sponsored_products: "Sponsored products", sales_coupons: "Coupon codes",
  image_banner: "Why LOIMART banner", trust_strip: "Promise icons", rich_text: "Text block", video: "Video", seller_cta: "Sell on LOIMART", newsletter: "Join button",
};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const bg = (url: string) => (url ? { backgroundImage: `url("${url}")` } : undefined);

export default function HomeBannersEditor() {
  const [themeId, setThemeId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [unpublished, setUnpublished] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<Device>("phone");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/v1/home-banners", { cache: "no-store" });
    const d = await r.json().catch(() => null);
    if (!r.ok) { setMessage({ ok: false, text: d?.error?.message ?? "Couldn't load the home page" }); return; }
    setThemeId(d.themeId); setSections(d.sections); setUnpublished(d.hasUnpublishedChanges); setDirty(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Updaters always apply to the latest state, so uploads finishing together never undo each other.
  const patch = (position: number, change: (s: Section) => Section) => {
    setSections((current) => current.map((s) => (s.position === position ? change(s) : s)));
    setDirty(true); setMessage(null);
  };
  const setSetting = (position: number, key: string, value: unknown | ((settings: Settings) => unknown)) =>
    patch(position, (s) => { const settings = s.settings ?? {}; return { ...s, settings: { ...settings, [key]: typeof value === "function" ? (value as (x: Settings) => unknown)(settings) : value } }; });

  async function save(): Promise<boolean> {
    setBusy(true); setMessage(null);
    try {
      const edits = sections.filter((s) => BANNER_TYPES.has(s.type)).map((s) => ({ position: s.position, type: s.type, isVisible: s.isVisible, settings: s.settings ?? {} }));
      const r = await fetch("/api/v1/home-banners", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections: edits }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setMessage({ ok: false, text: d?.error?.message ?? "Couldn't save" }); return false; }
      setDirty(false); setUnpublished(true);
      setMessage({ ok: true, text: "Saved. Shoppers see it after you publish." });
      return true;
    } finally { setBusy(false); }
  }

  async function publish() {
    if (dirty && !(await save())) return;
    setBusy(true);
    try {
      const r = await fetch("/api/v1/home-banners/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ themeId, message: "Published from Banner Studio" }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setMessage({ ok: false, text: d?.error?.message ?? "Couldn't publish" }); return; }
      setUnpublished(false);
      setMessage({ ok: true, text: "Published. The banners are live on the store." });
    } finally { setBusy(false); }
  }

  const banners = sections.filter((s) => BANNER_TYPES.has(s.type));
  const numberOf = (s: Section) => sections.filter((x) => x.type === s.type && x.position <= s.position).length;
  const title = (s: Section) => {
    if (s.type === "hero") return numberOf(s) === 1 && s.position === 0 ? "Main banner (top slider)" : `Slider banner ${numberOf(s)}`;
    return `${NAMES[s.type]} ${sections.filter((x) => x.type === s.type).length > 1 ? numberOf(s) : ""}`.trim();
  };
  const placeOf = (s: Section) => {
    const before = sections.filter((x) => x.position < s.position && x.isVisible).at(-1);
    return before ? `On the home page after “${NAMES[before.type] ?? before.type}”` : "Top of the home page";
  };

  const status = dirty ? { label: "Unsaved changes", tone: "bg-amber-50 text-amber-800" } : unpublished ? { label: "Saved · not published", tone: "bg-sky-50 text-sky-700" } : { label: "Live", tone: "bg-green-50 text-green-700" };

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Banner Studio" title="Home page banners" description="The big top slider, promo strips and banner rows on the store's home page. Upload, preview, then publish."
        actions={<div className="flex flex-wrap items-center gap-2">
          <span className={"rounded-full px-3 py-1 text-xs font-semibold " + status.tone}>{status.label}</span>
          <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Save</button>
          <button type="button" disabled={busy || (!dirty && !unpublished)} onClick={() => void publish()} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">{busy ? "Working…" : "Publish"}</button>
        </div>} />

      {message ? <p className={"mt-5 rounded-xl px-4 py-3 text-sm " + (message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{message.text}</p> : null}

      <div className="mt-5 flex items-center gap-2 text-sm">
        <span className="font-medium text-slate-600">Preview on</span>
        {(["phone", "desktop"] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (device === d ? "bg-slate-950 text-white" : "bg-white ring-1 ring-slate-200")}>{d === "phone" ? "Phone" : "Computer"}</button>)}
      </div>

      {!themeId && !message ? <p className="mt-6 text-sm text-slate-500">Loading…</p> : null}
      {themeId && !banners.length ? <p className="mt-6 rounded-2xl bg-white p-6 text-sm text-slate-500">The home page has no banner sections. Ask an admin to add one in Admin → Online Store.</p> : null}

      <div className="mt-6 space-y-6">
        {banners.map((s) => (
          <section key={s.position} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{title(s)}</h2>
                <p className="text-xs text-slate-500">{placeOf(s)}</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={s.isVisible} onChange={(e) => patch(s.position, (x) => ({ ...x, isVisible: e.target.checked }))} className="h-4 w-4 accent-[#6A2CD6]" />
                Show on the store
              </label>
            </div>
            <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="grid content-start gap-3 md:grid-cols-2">
                {s.type === "hero" ? <HeroFields s={s} setSetting={setSetting} /> : null}
                {s.type === "promo_banner" ? <PromoFields s={s} setSetting={setSetting} /> : null}
                {s.type === "banner_row" ? <RowFields s={s} setSetting={setSetting} /> : null}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Preview · {device === "phone" ? "phone" : "computer"}</p>
                <div className={"overflow-hidden border border-slate-200 bg-slate-50 " + (device === "phone" ? "mx-auto max-w-[260px]" : "")}>
                  <div className={s.isVisible ? "" : "opacity-40"}>{preview(s, device)}</div>
                </div>
                {!s.isVisible ? <p className="mt-2 text-xs font-semibold text-amber-700">Hidden: shoppers don&apos;t see this section.</p> : null}
              </div>
            </div>
          </section>
        ))}
      </div>
      {banners.length ? <p className="mt-6 text-xs text-slate-500">Need another promo strip or banner row, or to move one? An admin can add and arrange sections in Admin → Online Store; they then show up here for uploading.</p> : null}
    </main>
  );
}

type FieldProps = { s: Section; setSetting: (position: number, key: string, value: unknown | ((settings: Settings) => unknown)) => void };
function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={"text-sm font-medium " + (wide ? "md:col-span-2" : "")}>{label}<div className="mt-1">{children}</div></label>;
}

function HeroFields({ s, setSetting }: FieldProps) {
  const settings = s.settings ?? {};
  return (
    <HeroSlidesField
      slides={slidesFromSettings(settings)}
      onChange={(update) => setSetting(s.position, "slides", (current: Settings) => update(slidesFromSettings(current)))}
      slideSeconds={Number(settings.slideSeconds) || SLIDE_SECONDS_DEFAULT}
      onSecondsChange={(seconds) => setSetting(s.position, "slideSeconds", seconds)}
    />
  );
}

function PromoFields({ s, setSetting }: FieldProps) {
  const v = (k: string) => str(s.settings?.[k]);
  const set = (k: string) => (value: string) => setSetting(s.position, k, value);
  return (
    <>
      <MediaField kind="image" label="Desktop banner" hint="1800 × 320 px" size={{ width: 1800, height: 320 }} value={v("desktopImageUrl")} onChange={set("desktopImageUrl")} />
      <MediaField kind="image" label="Mobile banner" hint="800 × 329 px" size={{ width: 800, height: 329 }} value={v("mobileImageUrl")} onChange={set("mobileImageUrl")} />
      <MediaField kind="video" label="Desktop video (optional)" hint="Same shape as 1800 × 320" size={{ width: 1800, height: 320 }} value={v("desktopVideoUrl")} onChange={set("desktopVideoUrl")} />
      <MediaField kind="video" label="Mobile video (optional)" hint="Same shape as 800 × 329" size={{ width: 800, height: 329 }} value={v("mobileVideoUrl")} onChange={set("mobileVideoUrl")} />
      <Field label="Link (where the banner goes)"><input className="w-full rounded-lg border p-2.5 text-sm" placeholder="/c/fashion" value={v("href")} onChange={(e) => set("href")(e.target.value)} /></Field>
      <Field label="Describe the banner"><input className="w-full rounded-lg border p-2.5 text-sm" placeholder="e.g. Diwali sale — up to 40% off" value={v("alt")} onChange={(e) => set("alt")(e.target.value)} /></Field>
      <p className="text-xs text-slate-500 md:col-span-2">A strip without a desktop image or video is hidden on the store. Videos play muted on loop.</p>
    </>
  );
}

function RowFields({ s, setSetting }: FieldProps) {
  const settings = s.settings ?? {};
  return (
    <>
      <Field label="Heading above the banners (optional)"><input className="w-full rounded-lg border p-2.5 text-sm" placeholder="e.g. Deals of the day" value={str(settings.heading)} onChange={(e) => setSetting(s.position, "heading", e.target.value)} /></Field>
      <Field label="Show on">
        <select className="w-full rounded-lg border p-2.5 text-sm" value={str(settings.showOn) || "all"} onChange={(e) => setSetting(s.position, "showOn", e.target.value)}>
          <option value="all">Phones and computers</option><option value="desktop">Computers only</option><option value="mobile">Phones only</option>
        </select>
      </Field>
      <BannerRowField banners={Array.isArray(settings.banners) ? (settings.banners as RowBanner[]) : []} onChange={(update) => setSetting(s.position, "banners", (current: Settings) => update(Array.isArray(current.banners) ? (current.banners as RowBanner[]) : []))} />
      <p className="text-xs text-slate-500 md:col-span-2">Banners without an image are hidden on the store.</p>
    </>
  );
}

function preview(s: Section, device: Device) {
  const settings = s.settings ?? {};
  const phone = device === "phone";
  if (s.type === "hero") {
    const slides: HeroSlideSettings[] = slidesFromSettings(settings);
    if (!slides.length) return <div className="grid aspect-[4/5] place-items-center text-xs font-semibold text-slate-400">No slides yet</div>;
    return (
      <div className="space-y-1 bg-white p-1">
        {slides.map((slide, i) => {
          const image = phone ? slide.mobileImageUrl || slide.desktopImageUrl : slide.desktopImageUrl;
          const video = phone ? slide.mobileVideoUrl || (slide.mobileImageUrl ? undefined : slide.desktopVideoUrl) : slide.desktopVideoUrl;
          const st = slideStatus(slide);
          return (
            <div key={i} className={"relative overflow-hidden bg-slate-200 " + (phone ? "aspect-[4/5]" : "aspect-[8/3]")}>
              {video ? <video src={video} poster={image} muted autoPlay loop playsInline className="absolute inset-0 h-full w-full object-cover" /> : <div className={"absolute inset-0 bg-center " + (phone && !slide.mobileImageUrl ? "bg-contain bg-no-repeat bg-slate-800" : "bg-cover")} style={bg(image ?? "")} />}
              <span className="absolute left-1.5 top-1.5 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">Slide {i + 1}</span>
              <span className={"absolute right-1.5 top-1.5 px-1.5 py-0.5 text-[10px] font-semibold " + st.tone}>{st.label}</span>
            </div>
          );
        })}
      </div>
    );
  }
  if (s.type === "promo_banner") {
    const img = phone ? str(settings.mobileImageUrl) || str(settings.desktopImageUrl) : str(settings.desktopImageUrl);
    return img ? <div className={"w-full bg-cover bg-center " + (phone && settings.mobileImageUrl ? "aspect-[800/329]" : "aspect-[1800/320]")} style={bg(img)} /> : <div className="grid aspect-[1800/320] place-items-center text-xs font-semibold text-slate-400">Upload 1800 × 320</div>;
  }
  const rows = (Array.isArray(settings.banners) ? settings.banners : []) as RowBanner[];
  const showOn = str(settings.showOn) || "all";
  if ((phone && showOn === "desktop") || (!phone && showOn === "mobile")) return <div className="p-4 text-center text-xs font-semibold text-slate-400">Not shown on {phone ? "phones" : "computers"}</div>;
  const shape = rows.length <= 1 ? "aspect-[4/1]" : rows.length === 2 ? "aspect-[2/1]" : "aspect-[4/3]";
  return (
    <div className="bg-white p-1.5">
      {settings.heading ? <p className="px-1 pb-1 text-xs font-bold">{str(settings.heading)}</p> : null}
      <div className={"grid gap-1.5 " + (phone ? "" : rows.length === 2 ? "grid-cols-2" : rows.length >= 3 ? "grid-cols-3" : "")}>
        {(rows.length ? rows : [{} as RowBanner]).slice(0, 3).map((b, i) => b.imageUrl ? <div key={i} className={"w-full bg-cover bg-center " + shape} style={bg(b.imageUrl)} /> : <div key={i} className={"grid place-items-center bg-slate-100 text-[10px] font-semibold text-slate-400 " + shape}>Banner {i + 1}</div>)}
      </div>
    </div>
  );
}
