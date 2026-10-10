import Image from "next/image";
import Link from "next/link";
import {
  categories,
  coupons,
  createDatabase,
  liveAds,
  mediaAssets,
  pageSections,
  pages,
  productMedia,
  productVariants,
  products,
  sellers,
  themes,
} from "@azadimart/database";
import { settleAdAuctions } from "@azadimart/notify";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import CouponCard from "./components/coupon-card";
import HeroCarousel, { type HeroSlide } from "./components/hero-carousel";
import { ArrowRightIcon, BadgeIcon, CashIcon, CheckIcon, ReturnIcon, ShieldIcon } from "./components/icons";
import ProductCard, { type ProductCardData } from "./components/product-card";
import { TricolourRibbon } from "./components/site-header";
import { getCategoryRail, type RailCategory } from "./lib/category-rail";
import { loadCardBadges } from "./lib/offers";
import { SITE_NAME, SITE_URL, absoluteUrl, clip, jsonLd } from "./lib/seo";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const SELLER_URL = process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.azadimart.com";

type Settings = Record<string, unknown>;
type HomeSection = { id: string; type: string; settings: Settings };
type HomeCoupon = {
  id: string;
  code: string;
  title: string;
  discountType: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  discountValue: number;
  minimumOrderPaise: number;
  endsAt: Date | null;
};
type HomeCategory = { id: string; name: string; slug: string; imageKey: string | null; productCount: number };

const str = (settings: Settings, key: string, fallback = "") => (typeof settings[key] === "string" && String(settings[key]).trim() ? String(settings[key]) : fallback);
const num = (settings: Settings, key: string, fallback: number) => (typeof settings[key] === "number" && Number.isFinite(settings[key]) ? Number(settings[key]) : fallback);
const list = (settings: Settings, key: string) => (Array.isArray(settings[key]) ? (settings[key] as unknown[]).filter((v): v is string => typeof v === "string" && v.trim() !== "") : []);
/** Section links may point at /seller (the seller portal lives on its own host). */
const resolveHref = (href: string) => (href === "/seller" || href.startsWith("/seller/") ? SELLER_URL + href.slice("/seller".length) : href);

/** One card per product: the query returns a row per variant x image. Keeps the
 * cheapest active variant's price and the first image. */
function onePerProduct<T extends { id: string; pricePaise: number; mediaStorageKey: string | null }>(rows: T[], limit: number): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const current = byId.get(row.id);
    if (!current) byId.set(row.id, row);
    else if (row.pricePaise < current.pricePaise) byId.set(row.id, { ...row, mediaStorageKey: current.mediaStorageKey ?? row.mediaStorageKey });
  }
  return [...byId.values()].slice(0, limit);
}

async function getHome() {
  const db = createDatabase();
  const now = new Date();

  const [theme, couponRows, productRows, categoryRows] = await Promise.all([
    db.select().from(themes).where(eq(themes.status, "PUBLISHED")).limit(1).then((rows) => rows[0]),
    db.select({
      id: coupons.id, code: coupons.code, title: coupons.title, discountType: coupons.discountType,
      discountValue: coupons.discountValue, minimumOrderPaise: coupons.minimumOrderPaise,
      startsAt: coupons.startsAt, endsAt: coupons.endsAt,
    }).from(coupons).where(eq(coupons.isActive, true)).orderBy(desc(coupons.createdAt)).limit(24),
    db.select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      categoryId: products.categoryId,
      pricePaise: productVariants.pricePaise,
      compareAtPaise: productVariants.compareAtPaise,
      sellerName: sellers.storeName,
      mediaStorageKey: mediaAssets.storageKey,
      mediaAltText: mediaAssets.altText,
      reviewCount: products.reviewCount,
      ratingTotal: products.ratingTotal,
      priceDroppedAt: products.priceDroppedAt,
      priceBeforeDropPaise: products.priceBeforeDropPaise,
    }).from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .innerJoin(sellers, eq(sellers.id, products.sellerId))
      .leftJoin(productMedia, and(eq(productMedia.productId, products.id), eq(productMedia.kind, "IMAGE")))
      .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
      .where(and(eq(products.status, "LIVE"), eq(productVariants.isActive, true)))
      // Admin-arranged order first (Arrange products page); unarranged products follow, newest first.
      .orderBy(asc(products.position), desc(products.createdAt), asc(productMedia.sortOrder))
      .limit(400),
    db.select({ id: categories.id, name: categories.name, slug: categories.slug })
      .from(categories).where(and(eq(categories.isActive, true), isNull(categories.parentId)))
      .orderBy(asc(categories.sortOrder), asc(categories.name)).limit(24),
  ]);

  // Offer badges (admin tags, price drops) for every product a homepage section may show.
  const allLive = onePerProduct(productRows, 400);
  const badges = await loadCardBadges(db, allLive);
  const withBadge = <T extends { id: string }>(p: T) => ({ ...p, badge: badges[p.id] ?? null });
  const liveProducts = allLive.slice(0, 24).map(withBadge);

  // Each category tile uses a real product photo from that category when available.
  const homeCategories: HomeCategory[] = categoryRows.map((category) => {
    const inCategory = liveProducts.filter((product) => product.categoryId === category.id);
    return { ...category, imageKey: inCategory.find((product) => product.mediaStorageKey)?.mediaStorageKey ?? null, productCount: inCategory.length };
  });

  const activeCoupons: HomeCoupon[] = couponRows
    .filter((coupon) => coupon.startsAt <= now && (!coupon.endsAt || coupon.endsAt > now))
    .slice(0, 12);

  let sections: HomeSection[] = [];
  if (theme) {
    const page = (await db.select({ id: pages.id }).from(pages)
      .where(and(eq(pages.themeId, theme.id), eq(pages.slug, "home"), eq(pages.status, "PUBLISHED"))).limit(1))[0];
    if (page) {
      sections = (await db.select().from(pageSections).where(eq(pageSections.pageId, page.id)).orderBy(asc(pageSections.position)))
        .filter((section) => section.isVisible)
        .map((section) => ({ id: section.id, type: section.type, settings: (section.settings ?? {}) as Settings }));
    }
  }

  // Category showcase banners need every category (with photos) and a few products per chosen category.
  const showcaseIds = [...new Set(sections.filter((x) => x.type === "category_showcase" && typeof x.settings.categoryId === "string").map((x) => String(x.settings.categoryId)))];
  const rail = showcaseIds.length ? await getCategoryRail() : [];
  const showcaseProducts: Record<string, ProductCardData[]> = {};
  if (showcaseIds.length) {
    const familyOf = (id: string) => [id, ...rail.filter((c) => c.parentId === id).map((c) => c.id)];
    const wanted = new Set(showcaseIds.flatMap(familyOf));
    const rows = onePerProduct(productRows.filter((r) => wanted.has(r.categoryId)), 400).map(withBadge);
    for (const id of showcaseIds) {
      const family = new Set(familyOf(id));
      showcaseProducts[id] = rows.filter((r) => family.has(r.categoryId) && r.mediaStorageKey).slice(0, 6) as ProductCardData[];
    }
  }

  return { sections, coupons: activeCoupons, products: liveProducts as ProductCardData[], categories: homeCategories, rail, showcaseProducts, sponsored: await sponsoredSlides(db) };
}

/** Today's winning seller ads for the main banner, shown first and labelled "Sponsored". */
async function sponsoredSlides(db: ReturnType<typeof createDatabase>): Promise<HeroSlide[]> {
  try {
    await settleAdAuctions(db);
    const ads = await liveAds(db, "HOME_HERO");
    if (!ads.length) return [];
    const keys = await db.select({ id: mediaAssets.id, key: mediaAssets.storageKey }).from(mediaAssets)
      .where(inArray(mediaAssets.id, ads.flatMap((a) => [a.desktopImageAssetId, a.mobileImageAssetId]).filter((id): id is string => Boolean(id))));
    const url = (id: string | null) => { const key = id ? keys.find((k) => k.id === id)?.key : undefined; return key ? "/media/" + key : undefined; };
    return ads.map((ad) => ({ desktopImageUrl: url(ad.desktopImageAssetId), mobileImageUrl: url(ad.mobileImageAssetId), href: `/api/v1/ads/click/${ad.bidId}`, alt: ad.headline, sponsoredId: ad.bidId }))
      .filter((slide) => slide.desktopImageUrl);
  } catch {
    return []; // ads must never break the home page
  }
}

type HomeData = Awaited<ReturnType<typeof getHome>>;

/** Homepage title, description and share image, editable in Online Store > Search engine (SEO). */
export async function generateMetadata(): Promise<Metadata> {
  let seo: Record<string, unknown> = {};
  try {
    const theme = (await createDatabase().select({ settings: themes.settings }).from(themes).where(eq(themes.status, "PUBLISHED")).limit(1))[0];
    const value = (theme?.settings as Record<string, unknown> | undefined)?.seo;
    if (value && typeof value === "object") seo = value as Record<string, unknown>;
  } catch { /* defaults below */ }
  const text = (key: string) => (typeof seo[key] === "string" ? String(seo[key]).trim() : "");
  const title = text("title") || "AzadiMart — Online shopping from verified Indian sellers";
  const description = clip(text("description") || "Shop fashion, home & kitchen, beauty, electronics and more from KYC-verified Indian sellers. Quality-checked products, Cash on Delivery and easy returns across India.");
  const image = text("imageUrl");
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    openGraph: { title, description, url: "/", type: "website", siteName: SITE_NAME, locale: "en_IN", ...(image ? { images: [{ url: absoluteUrl(image), width: 1200, height: 630 }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(image ? { images: [absoluteUrl(image)] } : {}) },
  };
}

export default async function HomePage() {
  const data = await getHome();
  const sections = data.sections.length ? data.sections : FALLBACK_SECTIONS;
  const showsProducts = sections.some((section) => section.type === "featured_products");

  return (
    <main className="bg-canvas">
      {/* Tells Google who runs the site and enables the search box in results. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd([
        { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: SITE_URL, logo: absoluteUrl("/icon.png") },
        { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: SITE_URL, potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: SITE_URL + "/products?q={search_term_string}" }, "query-input": "required name=search_term_string" } },
      ])} />
      {sections.map((section) => {
        // "Show on": desktop-only sections start at 1024 px; mobile-only ones stop there.
        const showOn = section.settings.showOn;
        const content = <StoreSection section={section} data={data} />;
        if (showOn === "desktop") return <div key={section.id} className="hidden lg:block">{content}</div>;
        if (showOn === "mobile") return <div key={section.id} className="lg:hidden">{content}</div>;
        return <div key={section.id} className="contents">{content}</div>;
      })}
      {!showsProducts && data.products.length ? (
        <Container className="py-10 sm:py-14">
          <SectionHeading eyebrow="Just in" heading="Fresh from our sellers" actionLabel="Shop all" actionHref="/products" />
          <ProductGrid products={data.products.slice(0, 10)} />
        </Container>
      ) : null}
    </main>
  );
}

const FALLBACK_SECTIONS: HomeSection[] = [
  { id: "fallback-hero", type: "hero", settings: {} },
  { id: "fallback-strip", type: "marquee", settings: {} },
  { id: "fallback-categories", type: "category_grid", settings: {} },
  { id: "fallback-products", type: "featured_products", settings: {} },
  { id: "fallback-coupons", type: "sales_coupons", settings: {} },
  { id: "fallback-why", type: "image_banner", settings: {} },
  { id: "fallback-seller", type: "seller_cta", settings: {} },
];

function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={"mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 " + className}>{children}</div>;
}

function SectionHeading({ eyebrow, heading, subtitle, actionLabel, actionHref, center = false }: { eyebrow?: string; heading: string; subtitle?: string; actionLabel?: string; actionHref?: string; center?: boolean }) {
  return (
    <div className={"flex flex-col gap-3 sm:flex-row sm:items-end " + (center ? "items-center text-center sm:flex-col sm:items-center" : "sm:justify-between")}>
      <div>
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p> : null}
        <h2 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.03em] sm:text-[34px]">{heading}</h2>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-slate-500 sm:text-[15px]">{subtitle}</p> : null}
      </div>
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-brand-600">
          {actionLabel}<ArrowRightIcon size={16} className="transition group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}

function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {products.map((product) => <ProductCard key={product.id} product={product} />)}
    </div>
  );
}

function PillLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "light" | "outline" | "outlineLight" }) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-600",
    light: "bg-white text-slate-950 hover:bg-slate-100",
    outline: "border border-slate-300 text-slate-900 hover:border-slate-900",
    outlineLight: "border border-white/30 text-white hover:bg-white/10",
  }[variant];
  return <Link href={resolveHref(href)} className={"inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition " + styles}>{children}</Link>;
}

function StoreSection({ section, data }: { section: HomeSection; data: HomeData }) {
  const s = section.settings;
  switch (section.type) {
    case "hero": return <Hero s={s} sponsored={data.sponsored} />;
    case "marquee": return <Marquee s={s} />;
    case "promo_banner": return <PromoBanner s={s} />;
    case "banner_row": return <BannerRow s={s} />;
    case "category_showcase": return <CategoryShowcase s={s} rail={data.rail} products={data.showcaseProducts} />;
    case "category_grid": return <CategoryGrid s={s} categories={data.categories} />;
    case "featured_products": return <FeaturedProducts s={s} products={data.products} />;
    case "sales_coupons": return <Coupons s={s} coupons={data.coupons} />;
    case "image_banner": return <WhyBanner s={s} />;
    case "trust_strip": return <TrustStrip s={s} />;
    case "seller_cta": return <SellerCta s={s} />;
    case "rich_text": return <RichText s={s} />;
    case "video": return <VideoSection s={s} />;
    case "newsletter": return <Newsletter s={s} />;
    default: return null;
  }
}

/** Only on-site paths or https links (no protocol-relative or script URLs). */
function safeHref(href: string): string | undefined {
  const value = href.trim();
  if (/^\/(?![/\\])/.test(value)) return resolveHref(value);
  if (/^https:\/\//i.test(value)) return value;
  return undefined;
}

const secondsOf = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(30, Math.max(2, Math.round(v))) : undefined);

/** Banner slides from the hero settings; the original single-banner fields become slide 1. */
function heroSlides(s: Settings): HeroSlide[] {
  const raw = Array.isArray(s.slides) ? (s.slides as Settings[]) : [];
  // Once slides have been edited (even to none) the old single-banner fields are ignored.
  const fromLegacy: Settings[] = !Array.isArray(s.slides) && (str(s, "desktopImageUrl") || str(s, "desktopVideoUrl"))
    ? [{ desktopImageUrl: s.desktopImageUrl, mobileImageUrl: s.mobileImageUrl, desktopVideoUrl: s.desktopVideoUrl, mobileVideoUrl: s.mobileVideoUrl, href: s.primaryHref, alt: s.heading }]
    : [];
  return [...raw, ...fromLegacy]
    .map((slide) => ({
      desktopImageUrl: str(slide, "desktopImageUrl") || undefined,
      mobileImageUrl: str(slide, "mobileImageUrl") || undefined,
      desktopVideoUrl: str(slide, "desktopVideoUrl") || undefined,
      mobileVideoUrl: str(slide, "mobileVideoUrl") || undefined,
      href: str(slide, "href") ? safeHref(str(slide, "href")) : undefined,
      alt: str(slide, "alt", "AzadiMart offer"),
      // Banner-wide time (Admin → Online Store), unless this slide has its own.
      seconds: secondsOf(slide.seconds) ?? secondsOf(s.slideSeconds),
      playFullVideo: slide.playFullVideo === true,
    }))
    .filter((slide) => slide.desktopImageUrl || slide.desktopVideoUrl);
}

function Hero({ s, sponsored }: { s: Settings; sponsored: HeroSlide[] }) {
  const heading = str(s, "heading", "Everything India loves, from sellers you can trust.");
  const description = str(s, "description", "Shop quality-checked products from KYC-verified Indian sellers. Cash on Delivery and easy returns on every order.");
  const primaryLabel = str(s, "primaryLabel", "Shop now");
  const primaryHref = str(s, "primaryHref", "/products");
  const slides = [...sponsored.map((ad) => ({ ...ad, seconds: secondsOf(s.slideSeconds) })), ...heroSlides(s)];
  if (slides.length && str(s, "size") === "compact") {
    // Compact: a smaller, rounded banner card with space around it (e.g. lower down the page).
    return (
      <section className="py-8 sm:py-12">
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
          <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 sm:rounded-3xl"><HeroCarousel slides={slides} /></div>
        </div>
      </section>
    );
  }
  if (slides.length) return <><HeroCarousel slides={slides} /><TricolourRibbon /></>;

  // No banner uploaded yet: a designed banner in the same frame (8:3 desktop,
  // 4:5 mobile) so the layout does not change when one is uploaded.
  return (
    <section aria-label="Welcome">
      <div className="relative isolate overflow-hidden bg-navy text-white">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_15%,rgba(255,153,51,0.55),transparent_55%),radial-gradient(ellipse_at_10%_95%,rgba(19,136,8,0.5),transparent_55%)]" />
        <div aria-hidden className="absolute -right-24 top-1/2 -z-10 hidden h-[140%] w-1/2 -translate-y-1/2 rounded-full border border-white/10 sm:block" />
        <div aria-hidden className="absolute -right-4 top-1/2 -z-10 hidden h-[95%] w-1/3 -translate-y-1/2 rounded-full border border-white/10 sm:block" />
        <div className="mx-auto flex aspect-[4/5] max-w-[1440px] flex-col justify-end px-5 pb-10 sm:aspect-[8/3] sm:justify-center sm:px-6 sm:pb-0">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />{str(s, "eyebrow", "Made for India")}
          </span>
          <h1 className="mt-4 max-w-2xl text-[32px] font-semibold leading-[1.06] tracking-[-0.045em] sm:text-5xl lg:text-6xl">{heading}</h1>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-white/75 sm:text-base">{description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <PillLink href={primaryHref}>{primaryLabel}<ArrowRightIcon size={16} /></PillLink>
            {str(s, "secondaryLabel") ? <PillLink href={str(s, "secondaryHref", "/seller")} variant="outlineLight">{str(s, "secondaryLabel")}</PillLink> : null}
          </div>
        </div>
      </div>
      <TricolourRibbon />
      <div className="border-b border-slate-200 bg-white">
        <ul className="mx-auto grid max-w-[1440px] grid-cols-3 gap-3 px-4 py-4 sm:px-6">
          {[["KYC-verified", "sellers"], ["Quality", "checked"], ["Cash on", "Delivery"]].map(([a, b]) => (
            <li key={a} className="flex items-center justify-center gap-2 text-xs leading-4 text-slate-600 sm:text-[13px]">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-india-light text-india"><CheckIcon size={15} /></span>
              <span><span className="font-semibold text-slate-900">{a}</span> {b}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Banner art for one breakpoint: a muted looping video (image as poster) or an image. */
function BannerArt({ image, video, alt, className, priority = false }: { image: string; video: string; alt: string; className: string; priority?: boolean }) {
  return (
    <span className={"relative w-full overflow-hidden " + className}>
      {video ? (
        <video className="absolute inset-0 h-full w-full object-cover" src={video} poster={image || undefined} autoPlay muted loop playsInline preload="metadata" aria-label={alt} />
      ) : image ? (
        <Image src={image} alt={alt} fill priority={priority} sizes="100vw" className="object-cover" unoptimized />
      ) : null}
    </span>
  );
}

/** Full-width promotional strip: desktop 1800 × 320, mobile 800 × 329 (image or video). */
function PromoBanner({ s }: { s: Settings }) {
  const desktop = str(s, "desktopImageUrl");
  const desktopVideo = str(s, "desktopVideoUrl");
  if (!desktop && !desktopVideo) return null;
  const mobile = str(s, "mobileImageUrl", desktop);
  const mobileVideo = str(s, "mobileVideoUrl", str(s, "mobileImageUrl") ? "" : desktopVideo);
  const alt = str(s, "alt", "AzadiMart offer");
  const href = str(s, "href") ? safeHref(str(s, "href")) : undefined;
  const images = (
    <>
      <BannerArt image={mobile} video={mobileVideo} alt={alt} className="block aspect-[800/329] sm:hidden" />
      <BannerArt image={desktop} video={desktopVideo} alt={alt} className="hidden aspect-[1800/320] sm:block" />
    </>
  );
  return (
    <Container className="py-4 sm:py-6">
      {href ? (
        <Link href={href} className="block overflow-hidden rounded-xl bg-slate-200 transition hover:opacity-95">{images}</Link>
      ) : (
        <div className="overflow-hidden rounded-xl bg-slate-200">{images}</div>
      )}
    </Container>
  );
}

const SHOWCASE_STYLE: Record<string, { panel: string; text: string; sub: string; button: string; tile: string }> = {
  saffron: { panel: "bg-gradient-to-br from-[#ffb366] via-brand-500 to-brand-600", text: "text-white", sub: "text-white/85", button: "bg-white text-navy hover:bg-brand-50", tile: "bg-brand-50" },
  green: { panel: "bg-gradient-to-br from-[#2fa52a] via-india to-india-dark", text: "text-white", sub: "text-white/85", button: "bg-white text-india-dark hover:bg-india-light", tile: "bg-india-light" },
  navy: { panel: "bg-gradient-to-br from-navy-soft via-navy to-navy-deep", text: "text-white", sub: "text-white/80", button: "bg-tiranga-saffron text-white hover:bg-brand-600", tile: "bg-slate-100" },
  rose: { panel: "bg-gradient-to-br from-rose-100 via-rose-50 to-white", text: "text-rose-950", sub: "text-rose-900/75", button: "bg-rose-600 text-white hover:bg-rose-700", tile: "bg-rose-50" },
  sky: { panel: "bg-gradient-to-br from-sky-100 via-sky-50 to-white", text: "text-sky-950", sub: "text-sky-900/75", button: "bg-sky-700 text-white hover:bg-sky-800", tile: "bg-sky-50" },
  sand: { panel: "bg-gradient-to-br from-amber-100 via-orange-50 to-white", text: "text-amber-950", sub: "text-amber-900/75", button: "bg-navy text-white hover:bg-navy-deep", tile: "bg-amber-50" },
};

type ShowcaseTile = { label: string; href: string; imageSrc: string | null };

/**
 * "Top category" banner (like Meesho's Top Categories): a coloured panel with
 * the category name and View all on the left, and up to six photo tiles on
 * the right. Tiles are the admin's own, or else the category's
 * sub-categories, or else its newest live products.
 */
function CategoryShowcase({ s, rail, products: byCategory }: { s: Settings; rail: RailCategory[]; products: Record<string, ProductCardData[]> }) {
  const category = rail.find((c) => c.id === str(s, "categoryId"));
  if (!category) return null;
  const style = SHOWCASE_STYLE[str(s, "theme", "saffron")] ?? SHOWCASE_STYLE.saffron!;
  const custom = (Array.isArray(s.tiles) ? s.tiles : [])
    .filter((t): t is Settings => Boolean(t) && typeof t === "object" && Boolean(str(t as Settings, "imageUrl")) && Boolean(str(t as Settings, "label")))
    .map((t) => ({ label: str(t, "label"), href: safeHref(str(t, "href")) ?? "/c/" + category.slug, imageSrc: str(t, "imageUrl") }));
  const children = rail.filter((c) => c.parentId === category.id && c.count > 0);
  const tiles: ShowcaseTile[] = (custom.length
    ? custom
    : children.length
      ? [{ label: "All " + category.name, href: "/c/" + category.slug, imageSrc: category.imageKey ? "/media/" + category.imageKey : null }, ...children.map((c) => ({ label: c.name, href: "/c/" + c.slug, imageSrc: c.imageKey ? "/media/" + c.imageKey : null }))]
      : (byCategory[category.id] ?? []).map((p) => ({ label: p.title, href: "/products/" + p.slug, imageSrc: p.mediaStorageKey ? "/media/" + p.mediaStorageKey : null }))
  ).slice(0, 6);
  const heading = str(s, "heading", category.name);
  const image = str(s, "imageUrl");

  return (
    <Container className="py-4 sm:py-6">
      <div className="grid overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className={"relative flex min-h-[200px] flex-col justify-between overflow-hidden p-6 sm:p-7 " + style.panel}>
          {image ? <Image src={image} alt="" fill sizes="(max-width:1024px) 100vw, 380px" className="object-cover opacity-90" unoptimized /> : null}
          {image ? <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" /> : null}
          <div className={"relative " + (image ? "text-white" : style.text)}>
            <p className={"text-[11px] font-semibold uppercase tracking-[0.18em] " + (image ? "text-white/80" : style.sub)}>{str(s, "eyebrow", "Top category")}</p>
            <h2 className="mt-2 text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[34px]">{heading}</h2>
            {str(s, "subtitle") ? <p className={"mt-2 max-w-xs text-sm leading-6 " + (image ? "text-white/85" : style.sub)}>{str(s, "subtitle")}</p> : null}
          </div>
          <Link href={"/c/" + category.slug} className={"relative mt-6 inline-flex w-fit items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition " + (image ? "bg-white text-navy hover:bg-brand-50" : style.button)}>
            {str(s, "buttonLabel", "View all")}<ArrowRightIcon size={16} />
          </Link>
        </div>
        {tiles.length ? (
          <ul className="flex snap-x gap-3 overflow-x-auto p-4 [scrollbar-width:none] sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:p-6 lg:grid-cols-6 lg:content-center">
            {tiles.map((tile) => (
              <li key={tile.href + tile.label} className="w-[36%] shrink-0 snap-start sm:w-auto">
                <Link href={tile.href} className="group block">
                  <span className={"relative block aspect-square overflow-hidden rounded-xl " + style.tile}>
                    {tile.imageSrc ? <Image src={tile.imageSrc} alt="" fill sizes="(max-width:640px) 36vw, (max-width:1024px) 22vw, 140px" className="object-cover transition duration-500 group-hover:scale-[1.05]" /> : null}
                  </span>
                  <span className="mt-2 line-clamp-2 block text-center text-[12.5px] font-semibold leading-snug text-slate-800 group-hover:text-brand-600">{tile.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid place-items-center p-8 text-sm text-slate-500">Products for this category are coming soon.</div>
        )}
      </div>
    </Container>
  );
}

/**
 * Banner row (Meesho-style mid-page banners): 1–3 clickable image banners side
 * by side between product sections. One banner is 4:1, two are 2:1 each,
 * three are 4:3 each. On phones they stack.
 */
function BannerRow({ s }: { s: Settings }) {
  const banners = (Array.isArray(s.banners) ? s.banners : [])
    .filter((b): b is Settings => Boolean(b) && typeof b === "object" && typeof (b as Settings).imageUrl === "string" && Boolean((b as Settings).imageUrl))
    .slice(0, 3);
  if (!banners.length) return null;
  const aspect = banners.length === 1 ? "aspect-[4/1]" : banners.length === 2 ? "aspect-[2/1]" : "aspect-[4/3]";
  const cols = banners.length === 1 ? "" : banners.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";
  const heading = str(s, "heading");
  return (
    <Container className="py-5 sm:py-7">
      {heading ? <h2 className="mb-4 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{heading}</h2> : null}
      <div className={"grid gap-3 sm:gap-4 " + cols}>
        {banners.map((b, i) => {
          const alt = str(b, "alt", heading || "AzadiMart offer");
          const href = str(b, "href") ? safeHref(str(b, "href")) : undefined;
          const art = (
            <span className={"relative block overflow-hidden rounded-xl bg-slate-200 " + aspect}>
              <Image src={str(b, "imageUrl")} alt={alt} fill sizes={banners.length === 1 ? "(max-width:1280px) 100vw, 1232px" : "(max-width:640px) 100vw, 40vw"} className="object-cover transition duration-500 group-hover:scale-[1.02]" unoptimized />
            </span>
          );
          return href ? <Link key={i} href={href} className="group block" aria-label={alt}>{art}</Link> : <div key={i}>{art}</div>;
        })}
      </div>
    </Container>
  );
}

function Marquee({ s }: { s: Settings }) {
  const items = list(s, "items");
  const messages = items.length ? items : ["Cash on Delivery available", "KYC-verified sellers", "Quality-checked products", "Easy 7-day returns", "Secure checkout"];
  const row = [...messages, ...messages];
  return (
    <section aria-label="Highlights" className="overflow-hidden bg-navy py-3 text-white">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap motion-reduce:animate-none">
        {[...row, ...row].map((item, index) => (
          <span key={index} aria-hidden={index >= messages.length} className="flex items-center gap-10 text-[13px] font-medium uppercase tracking-[0.12em]">
            {item}<span className={index % 2 ? "text-[#5fd35a]" : "text-tiranga-saffron"}>✦</span>
          </span>
        ))}
      </div>
    </section>
  );
}

const TILE_TINTS = ["from-brand-100 to-brand-50", "from-india-light to-white", "from-slate-200 to-slate-50", "from-amber-100 to-white", "from-rose-100 to-white", "from-sky-100 to-white"];

function CategoryGrid({ s, categories: all }: { s: Settings; categories: HomeCategory[] }) {
  // Show the categories named in the admin (matched to real ones), else every active category.
  const wanted = list(s, "categories").map((name) => name.toLowerCase());
  const matched = wanted.length ? all.filter((category) => wanted.includes(category.name.toLowerCase())) : [];
  const tiles = (matched.length ? matched : all).slice(0, 8);
  if (!tiles.length) return null;
  return (
    <Container className="py-10 sm:py-14">
      <SectionHeading eyebrow="Explore" heading={str(s, "heading", "Shop by category")} subtitle={str(s, "subtitle")} actionLabel="All products" actionHref="/products" />
      <div className={"mt-6 grid gap-3 sm:gap-4 " + (tiles.length >= 4 ? "grid-cols-2 md:grid-cols-4" : tiles.length === 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
        {tiles.map((category, index) => (
          <Link key={category.id} href={"/c/" + category.slug} className={"group relative flex flex-col " + (tiles.length >= 3 ? "aspect-[4/5]" : "aspect-[16/9] sm:aspect-[2/1]") + " justify-end overflow-hidden bg-gradient-to-br p-4 sm:p-5 " + TILE_TINTS[index % TILE_TINTS.length]}>
            {category.imageKey ? (
              <>
                <Image src={"/media/" + category.imageKey} alt="" fill sizes="(max-width:768px) 46vw, 24vw" className="object-cover transition duration-500 group-hover:scale-[1.04]" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              </>
            ) : (
              <span aria-hidden className="absolute right-3 top-2 text-[88px] font-semibold leading-none tracking-[-0.06em] text-black/[0.06] sm:text-[120px]">{category.name.slice(0, 1)}</span>
            )}
            <span className={"relative flex items-end justify-between gap-2 " + (category.imageKey ? "text-white" : "text-slate-950")}>
              <span>
                <span className="block text-base font-semibold leading-tight sm:text-xl">{category.name}</span>
                {category.productCount ? <span className={"mt-1 block text-xs " + (category.imageKey ? "text-white/80" : "text-slate-500")}>{category.productCount}+ products</span> : null}
              </span>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-slate-950 transition group-hover:translate-x-0.5"><ArrowRightIcon size={15} /></span>
            </span>
          </Link>
        ))}
      </div>
    </Container>
  );
}

function FeaturedProducts({ s, products }: { s: Settings; products: ProductCardData[] }) {
  const limit = Math.max(1, Math.min(20, Math.floor(num(s, "limit", 10))));
  return (
    <Container className="py-10 sm:py-14">
      <SectionHeading eyebrow="Curated" heading={str(s, "heading", "Trending on AzadiMart")} subtitle={str(s, "subtitle", "Handpicked products from verified sellers")} actionLabel="View all" actionHref="/products" />
      {products.length ? (
        <ProductGrid products={products.slice(0, limit)} />
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">New products are on their way. Check back soon.</div>
      )}
    </Container>
  );
}

function Coupons({ s, coupons }: { s: Settings; coupons: HomeCoupon[] }) {
  if (!coupons.length) return null;
  const limit = Math.max(1, Math.min(12, Math.floor(num(s, "limit", 6))));
  return (
    <section className="bg-brand-50 py-10 sm:py-14">
      <Container>
        <SectionHeading eyebrow="Offers" heading={str(s, "heading", "Extra savings, today")} subtitle={str(s, "subtitle", "Copy a code and apply it at checkout.")} />
        <div className="mt-6 grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
          {coupons.slice(0, limit).map((coupon) => <CouponCard key={coupon.id} coupon={coupon} />)}
        </div>
      </Container>
    </section>
  );
}

const WHY_TILES = [
  { icon: BadgeIcon, title: "Verified sellers", text: "PAN, GST and bank details checked before a seller can list." },
  { icon: ShieldIcon, title: "Quality checked", text: "Every product is reviewed by our team before it goes live." },
  { icon: CashIcon, title: "Cash on Delivery", text: "Pay at your doorstep. No card needed." },
  { icon: ReturnIcon, title: "Easy returns", text: "Return eligible items within 7 days of delivery." },
];

function WhyBanner({ s }: { s: Settings }) {
  const image = str(s, "imageUrl");
  return (
    <Container className="py-10 sm:py-14">
      <div className="grid overflow-hidden lg:grid-cols-2">
        <div className="relative flex flex-col justify-center bg-gradient-to-br from-brand-500 to-brand-600 p-8 text-white sm:p-12">
          <TricolourRibbon className="absolute inset-x-0 bottom-0 h-1" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">{str(s, "eyebrow", "Why AzadiMart")}</p>
          <h2 className="mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-5xl">{str(s, "heading", "Shopping you can trust.")}</h2>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-white/90">{str(s, "description", "We verify every seller and check every product, so you can shop with confidence.")}</p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            {["Verified", "Quality checked", "Made in India"].map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]"><CheckIcon size={16} />{item}</li>
            ))}
          </ul>
          <div className="mt-8"><PillLink href={str(s, "buttonHref", "/products")} variant="light">{str(s, "buttonLabel", "Start shopping")}<ArrowRightIcon size={16} /></PillLink></div>
        </div>
        {image ? (
          <div className="relative min-h-72 bg-slate-200"><Image src={image} alt="" fill sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" unoptimized /></div>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-slate-200">
            {WHY_TILES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex min-h-44 flex-col justify-between bg-[#eff0f3] p-5 sm:p-7">
                <Icon size={28} className="text-brand-600" />
                <div className="mt-6">
                  <p className="text-base font-semibold sm:text-lg">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-[13px]">{text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}

// Icon tints cycle through the tricolour palette: saffron, green, navy.
const TRUST_ICONS = [
  { icon: BadgeIcon, tint: "bg-brand-50 text-brand-600" },
  { icon: ShieldIcon, tint: "bg-india-light text-india" },
  { icon: CashIcon, tint: "bg-navy/5 text-navy" },
  { icon: ReturnIcon, tint: "bg-brand-50 text-brand-600" },
];

// Each item is "Title | short line"; the short line is optional.
function TrustStrip({ s }: { s: Settings }) {
  const items = list(s, "items").slice(0, 4);
  if (!items.length) return null;
  return (
    <section aria-label="Our promise" className="border-b border-slate-200 bg-white">
      <Container className="grid grid-cols-2 gap-x-3 gap-y-5 py-6 sm:py-7 lg:grid-cols-4">
        {items.map((item, i) => {
          const [title, text] = item.split("|").map((part) => part.trim());
          const { icon: Icon, tint } = TRUST_ICONS[i % TRUST_ICONS.length]!;
          return (
            <div key={item} className="flex items-center gap-3 sm:items-start">
              <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-full sm:h-11 sm:w-11 " + tint}><Icon size={20} /></span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-tight sm:text-sm">{title}</p>
                {text ? <p className="mt-0.5 hidden text-xs leading-5 text-slate-500 sm:block">{text}</p> : null}
              </div>
            </div>
          );
        })}
      </Container>
    </section>
  );
}

function SellerCta({ s }: { s: Settings }) {
  const image = str(s, "imageUrl");
  return (
    <Container className="py-10 sm:py-14">
      <div className="relative overflow-hidden bg-navy p-8 text-white sm:p-12">
        {image ? (
          <>
            {/* Optional photo on the right, fading into navy behind the text (darker on phones). */}
            <Image src={image} alt="" fill sizes="100vw" className="object-cover object-right" unoptimized />
            <span aria-hidden="true" className="absolute inset-0 bg-navy/85 lg:bg-transparent lg:bg-gradient-to-r lg:from-navy lg:via-navy/70 lg:to-navy/35" />
          </>
        ) : (
          <>
            <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-tiranga-saffron/25 blur-3xl" />
            <div aria-hidden className="absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-tiranga-green/25 blur-3xl" />
          </>
        )}
        <TricolourRibbon className="absolute inset-x-0 top-0 h-1" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-400">{str(s, "eyebrow", "Sell on AzadiMart")}</p>
            <h2 className="mt-3 max-w-2xl text-[28px] font-semibold leading-[1.1] tracking-[-0.035em] sm:text-[40px]">{str(s, "heading", "Grow your business with India's trusted marketplace.")}</h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-white/70">{str(s, "description", "Simple onboarding, a professional storefront and Cash on Delivery orders from day one.")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <PillLink href={str(s, "primaryHref", "/seller/register")}>{str(s, "primaryLabel", "Start selling")}</PillLink>
            {str(s, "secondaryLabel") ? <PillLink href={str(s, "secondaryHref", "/seller/login")} variant="outlineLight">{str(s, "secondaryLabel")}</PillLink> : null}
          </div>
        </div>
      </div>
    </Container>
  );
}

function RichText({ s }: { s: Settings }) {
  const heading = str(s, "heading");
  const body = str(s, "description", str(s, "subtitle"));
  if (!heading && !body) return null;
  return (
    <Container className="py-10 text-center sm:py-14">
      {heading ? <h2 className="mx-auto max-w-3xl text-[26px] font-semibold tracking-[-0.03em] sm:text-[34px]">{heading}</h2> : null}
      {body ? <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-7 text-slate-600">{body}</p> : null}
    </Container>
  );
}

function VideoSection({ s }: { s: Settings }) {
  const url = str(s, "videoUrl");
  if (!url) return null;
  return (
    <Container className="py-10 sm:py-14">
      {str(s, "heading") ? <SectionHeading heading={str(s, "heading")} subtitle={str(s, "subtitle")} /> : null}
      <video className="mt-6 aspect-video w-full rounded-2xl bg-black object-cover" src={url} autoPlay muted loop playsInline controls={false} />
    </Container>
  );
}

/** Shown only with a destination link (e.g. a WhatsApp channel): there is no
 * email-subscription backend, so a form that silently drops emails is not rendered. */
function Newsletter({ s }: { s: Settings }) {
  const href = str(s, "buttonHref");
  if (!href) return null;
  return (
    <Container className="py-10 sm:py-14">
      <div className="flex flex-col gap-5 bg-white p-8 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">{str(s, "heading", "Never miss a deal")}</h2>
          <p className="mt-1.5 text-sm text-slate-500">{str(s, "description", "Get new arrivals and offers first.")}</p>
        </div>
        <PillLink href={href}>{str(s, "buttonLabel", "Join now")}</PillLink>
      </div>
    </Container>
  );
}
