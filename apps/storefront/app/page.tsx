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
import SponsoredRow from "./components/sponsored-row";
import { ArrowRightIcon, BadgeIcon, CashIcon, CheckIcon, ReturnIcon, ShieldIcon } from "./components/icons";
import ProductCard, { type ProductCardData } from "./components/product-card";
import { TricolourRibbon } from "./components/site-header";
import { getCategoryRail, type RailCategory } from "./lib/category-rail";
import { loadCardBadges, loadCardCoupons } from "./lib/offers";
import { SITE_NAME, SITE_URL, absoluteUrl, clip, jsonLd } from "./lib/seo";
import type { Metadata } from "next";
import LazyVideo from "./components/lazy-video";
import SectionHeading from "./components/section-heading";

export const dynamic = "force-dynamic";

const SELLER_URL = process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.loimart.com";

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
/** imageSrc: the photo uploaded in Admin, else one of the category's product photos. */
type HomeCategory = { id: string; name: string; slug: string; imageSrc: string | null; productCount: number; minPricePaise: number | null };

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
    db.select({ id: categories.id, name: categories.name, slug: categories.slug, imageUrl: categories.imageUrl })
      .from(categories).where(and(eq(categories.isActive, true), isNull(categories.parentId)))
      .orderBy(asc(categories.sortOrder), asc(categories.name)).limit(24),
  ]);

  // Offer badges (admin tags, price drops) for every product a homepage section may show.
  const allLive = onePerProduct(productRows, 400);
  const [badges, cardCoupons] = await Promise.all([loadCardBadges(db, allLive), loadCardCoupons(db, allLive)]);
  const withBadge = <T extends { id: string }>(p: T) => ({ ...p, badge: badges[p.id] ?? null, coupon: cardCoupons[p.id] ?? null });
  const liveProducts = allLive.slice(0, 24).map(withBadge);

  // Each category tile uses a real product photo from that category (or its sub-categories) and its lowest price.
  const parentOf = new Map((await getCategoryRail()).map((c) => [c.id, c.parentId]));
  const homeCategories: HomeCategory[] = categoryRows.map((category) => {
    const inCategory = allLive.filter((product) => product.categoryId === category.id || parentOf.get(product.categoryId) === category.id);
    const prices = inCategory.map((product) => product.pricePaise);
    const productPhoto = inCategory.find((product) => product.mediaStorageKey)?.mediaStorageKey;
    return {
      id: category.id, name: category.name, slug: category.slug,
      imageSrc: category.imageUrl || (productPhoto ? "/media/" + productPhoto : null),
      productCount: inCategory.length,
      minPricePaise: prices.length ? Math.min(...prices) : null,
    };
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

  // Today's winning "Sponsored products row" ads (one product per slot), only for products that are live.
  let sponsoredProducts: Array<{ bidId: string; product: ProductCardData }> = [];
  if (sections.some((x) => x.type === "sponsored_products")) {
    try {
      const seen = new Set<string>();
      sponsoredProducts = (await liveAds(db, "HOME_PRODUCTS")).flatMap((ad) => {
        const product = allLive.find((p) => p.id === ad.productId);
        if (!product || seen.has(product.id)) return [];
        seen.add(product.id);
        return [{ bidId: ad.bidId, product: withBadge(product) as ProductCardData }];
      });
    } catch { /* ads must never break the home page */ }
  }

  return { sections, coupons: activeCoupons, products: liveProducts as ProductCardData[], categories: homeCategories, rail, showcaseProducts, sponsored: await sponsoredSlides(db), sponsoredProducts };
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
  const title = text("title") || "LOIMART — Online shopping from verified Indian sellers";
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
      <CategoryCircles categories={data.categories} />
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
          <ProductGrid products={data.products.slice(0, 12)} />
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

/** Centred title with a line either side (small label above, optional View all link below). */
/**
 * Round category photos right under the header (first item: everything).
 * Swipes sideways on phones; spreads across the full width on desktop.
 */
function CategoryCircles({ categories: all }: { categories: HomeCategory[] }) {
  if (!all.length) return null;
  const items = [{ id: "all", name: "All", slug: "", imageSrc: null as string | null }, ...all.slice(0, 11)];
  return (
    <nav aria-label="Shop by category" className="bg-white">
      <ul className="mx-auto flex max-w-[1440px] gap-3 overflow-x-auto px-4 pb-3 pt-3 [scrollbar-width:none] sm:px-6 lg:justify-between lg:gap-2 lg:px-10">
        {items.map((c) => (
          <li key={c.id} className="shrink-0">
            <Link href={c.slug ? "/c/" + c.slug : "/products"} className="group flex w-[72px] flex-col items-center gap-1.5 lg:w-[96px]">
              <span className="relative grid h-[60px] w-[60px] place-items-center overflow-hidden rounded-full bg-[#F3EDFD] transition group-hover:ring-2 group-hover:ring-[#6A2CD6] lg:h-[68px] lg:w-[68px]">
                {c.imageSrc ? (
                  <Image src={c.imageSrc} alt="" fill sizes="96px" className={"object-cover" + (c.imageSrc.startsWith("/media/product-media/") ? " scale-[1.3]" : "")} unoptimized={c.imageSrc.startsWith("https://")} />
                ) : (
                  <svg width="26" height="26" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 0 Q23 17 40 20 Q23 23 20 40 Q17 23 0 20 Q17 17 20 0Z" fill="#6A2CD6" /></svg>
                )}
              </span>
              <span className="line-clamp-2 min-h-[30px] text-center text-[11.5px] font-semibold leading-[15px] text-slate-800 group-hover:text-[#6A2CD6] lg:text-[12.5px] lg:leading-4">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 2 / 3 / 6 across. Trimmed to a multiple of 6 (when there are 6+) so every row is full at every size. */
function ProductGrid({ products }: { products: ProductCardData[] }) {
  const shown = products.length >= 6 ? products.slice(0, products.length - (products.length % 6)) : products;
  return (
    <div className="mt-5 grid grid-cols-2 gap-1.5 sm:gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {shown.map((product) => <ProductCard key={product.id} product={product} sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 16vw" />)}
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
    case "hero": {
      // Paid banner ads go in the top banner only, not in later hero sections too.
      const firstHero = (data.sections.length ? data.sections : FALLBACK_SECTIONS).find((x) => x.type === "hero");
      return <Hero s={s} sponsored={firstHero?.id === section.id ? data.sponsored : []} />;
    }
    case "marquee": return <OfferStrip s={s} coupon={data.coupons[0]} />;
    case "promo_banner": return <PromoBanner s={s} />;
    case "banner_row": return <BannerRow s={s} />;
    case "category_showcase": return <CategoryShowcase s={s} rail={data.rail} products={data.showcaseProducts} />;
    case "category_grid": return <CategoryGrid s={s} categories={data.categories} />;
    case "featured_products": return <FeaturedProducts s={s} products={data.products} />;
    case "sponsored_products": return <SponsoredProducts s={s} items={data.sponsoredProducts} />;
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
  // Scheduled slides (Banner Studio): only between their start and end time.
  const now = Date.now();
  const inWindow = (slide: Settings) => {
    const from = Date.parse(str(slide, "startsAt")), until = Date.parse(str(slide, "endsAt"));
    return !(from > now) && !(until <= now);
  };
  return [...raw, ...fromLegacy]
    .filter(inWindow)
    .map((slide) => ({
      desktopImageUrl: str(slide, "desktopImageUrl") || undefined,
      mobileImageUrl: str(slide, "mobileImageUrl") || undefined,
      desktopVideoUrl: str(slide, "desktopVideoUrl") || undefined,
      mobileVideoUrl: str(slide, "mobileVideoUrl") || undefined,
      // The button is part of the banner art, so every banner links somewhere (default: all products).
      href: str(slide, "href") ? safeHref(str(slide, "href")) : "/products",
      alt: str(slide, "alt", "LOIMART offer"),
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
      <Container className="py-6 sm:py-8">
        <div className="overflow-hidden rounded-2xl">
          <HeroCarousel slides={slides} />
        </div>
      </Container>
    );
  }
  if (slides.length) return <HeroCarousel slides={slides} />;

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
/** fit="contain": art made for the other frame is shown whole on a blurred copy of itself (never cropped). */
function BannerArt({ image, video, alt, className, priority = false, fit = "cover" }: { image: string; video: string; alt: string; className: string; priority?: boolean; fit?: "cover" | "contain" }) {
  return (
    <span className={"relative w-full overflow-hidden " + className}>
      {video ? (
        <LazyVideo className={"absolute inset-0 h-full w-full " + (fit === "contain" ? "object-contain bg-black" : "object-cover")} src={video} poster={image || undefined} label={alt} />
      ) : image ? (
        fit === "contain" ? (
          <>
            <Image src={image} alt="" aria-hidden="true" fill sizes="100vw" className="scale-110 object-cover blur-xl brightness-75" unoptimized />
            <Image src={image} alt={alt} fill priority={priority} sizes="100vw" className="object-contain" unoptimized />
          </>
        ) : (
          <Image src={image} alt={alt} fill priority={priority} sizes="100vw" className="object-cover" unoptimized />
        )
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
  const alt = str(s, "alt", "LOIMART offer");
  const href = str(s, "href") ? safeHref(str(s, "href")) : undefined;
  const images = (
    <>
      <BannerArt image={mobile} video={mobileVideo} alt={alt} className="block aspect-[800/329] sm:hidden" fit={str(s, "mobileImageUrl") || str(s, "mobileVideoUrl") ? "cover" : "contain"} />
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
      ? [{ label: "All " + category.name, href: "/c/" + category.slug, imageSrc: category.imageSrc }, ...children.map((c) => ({ label: c.name, href: "/c/" + c.slug, imageSrc: c.imageSrc }))]
      : (byCategory[category.id] ?? []).map((p) => ({ label: p.title, href: "/products/" + p.slug, imageSrc: p.mediaStorageKey ? "/media/" + p.mediaStorageKey : null }))
  ).slice(0, 6);
  const heading = str(s, "heading", category.name);

  return (
    <Container className="py-6 sm:py-8">
      <SectionHeading eyebrow={str(s, "eyebrow", "Top category")} heading={heading} subtitle={str(s, "subtitle")} actionLabel={str(s, "buttonLabel", "View all")} actionHref={"/c/" + category.slug} />
      {tiles.length ? (
        <ul className="-mx-4 mt-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:gap-4 sm:overflow-visible sm:px-0">
          {tiles.map((tile) => (
            <li key={tile.href + tile.label} className="w-[44%] shrink-0 snap-start sm:w-[calc((100%-48px)/4)] lg:w-[calc((100%-80px)/6)]">
              <Link href={tile.href} className="group flex h-full flex-col overflow-hidden rounded-none border border-slate-200/80 bg-white transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className="relative block aspect-square overflow-hidden bg-[#F3EDFD]">
                  {tile.imageSrc ? <Image src={tile.imageSrc} alt="" fill sizes="(max-width:640px) 44vw, (max-width:1024px) 24vw, 220px" className="object-cover transition duration-500 group-hover:scale-[1.04]" /> : null}
                </span>
                <span className="flex flex-1 flex-col justify-between gap-2 p-2.5 sm:p-3">
                  <span className="line-clamp-2 min-h-[2.5em] text-[13px] font-semibold leading-tight text-slate-900 sm:text-[14px]">{tile.label}</span>
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#6A2CD6]">Shop now<ArrowRightIcon size={13} className="transition group-hover:translate-x-0.5" /></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 grid place-items-center rounded-2xl bg-white p-8 text-sm text-slate-500">Products for this category are coming soon.</div>
      )}
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
          const alt = str(b, "alt", heading || "LOIMART offer");
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

const STRIP_ICONS = [CashIcon, BadgeIcon, ReturnIcon];

/**
 * Under the banner: a dark offer bar (the newest coupon + Cash on Delivery)
 * and three promises with icons. The promises are the admin's highlight items.
 */
function OfferStrip({ s, coupon }: { s: Settings; coupon?: HomeCoupon }) {
  const items = list(s, "items");
  const promises = (items.length >= 3 ? items : ["Cash on Delivery", "Verified sellers", "7-day returns"]).slice(0, 3);
  const offer = coupon
    ? coupon.discountType === "PERCENTAGE" ? `Extra ${coupon.discountValue}% off` : coupon.discountType === "FIXED" ? `Flat ₹${Math.round(coupon.discountValue / 100)} off` : "Free delivery"
    : null;
  return (
    <section aria-label="Offers" className="bg-white">
      <Container className="pb-2 pt-4 sm:pt-5">
        <div className="grid grid-cols-2 items-center divide-x divide-white/20 overflow-hidden rounded-xl bg-[#1B0840] px-2 py-3 text-white sm:rounded-2xl sm:py-4">
          <div className="px-3 text-center sm:px-6">
            <p className="text-[14px] font-extrabold uppercase leading-tight tracking-[0.02em] sm:text-[18px]">{offer ?? "Shop & save"}</p>
            <p className="mt-0.5 text-[11px] text-white/70 sm:text-[12px]">{coupon ? <>Use code <b className="font-mono font-bold text-[#F9CB5B]">{coupon.code}</b></> : "New deals every day"}</p>
          </div>
          <div className="px-3 text-center sm:px-6">
            <p className="text-[14px] font-extrabold uppercase leading-tight tracking-[0.02em] sm:text-[18px]">Cash on Delivery</p>
            <p className="mt-0.5 text-[11px] text-white/70 sm:text-[12px]">Pay when it arrives</p>
          </div>
        </div>
        <ul className="mx-auto mt-3 grid max-w-[720px] grid-cols-3 divide-x divide-slate-200">
          {promises.map((item, i) => {
            const Icon = STRIP_ICONS[i]!;
            return (
              <li key={item} className="flex flex-col items-center justify-center gap-1 px-2 text-center sm:flex-row sm:gap-2 sm:text-left">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#2A0E5F] text-white"><Icon size={15} /></span>
                <span className="text-[11.5px] font-semibold leading-tight text-slate-900 sm:text-[13px]">{item.split("|")[0]!.trim()}</span>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

const rupees = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");

/** Photo tiles, 3 across on phones and 6 on desktop: name top-left, "From ₹" price tag bottom-left. */
function CategoryGrid({ s, categories: all }: { s: Settings; categories: HomeCategory[] }) {
  // Show the categories named in the admin (matched to real ones), else every active category.
  const wanted = list(s, "categories").map((name) => name.toLowerCase());
  const matched = wanted.length ? all.filter((category) => wanted.includes(category.name.toLowerCase())) : [];
  const tiles = (matched.length ? matched : all).slice(0, 12);
  if (!tiles.length) return null;
  return (
    <Container className="py-6 sm:py-8">
      <SectionHeading eyebrow="Explore" heading={str(s, "heading", "Shop by category")} subtitle={str(s, "subtitle")} />
      <div className="mt-4 flex flex-wrap justify-center gap-2.5 sm:gap-4">
        {tiles.map((category) => (
          <Link key={category.id} href={"/c/" + category.slug} className="group flex w-[calc((100%-20px)/3)] flex-col overflow-hidden rounded-none border border-slate-200/80 bg-white transition hover:-translate-y-0.5 hover:shadow-lift sm:w-[calc((100%-32px)/3)] lg:w-[calc((100%-80px)/6)]">
            <span className="relative block aspect-square overflow-hidden bg-[#F3EDFD]">
              {category.imageSrc ? (
                <Image src={category.imageSrc} alt="" unoptimized={category.imageSrc.startsWith("https://")} fill sizes="(max-width:1024px) 32vw, 220px" className="object-cover transition duration-500 group-hover:scale-[1.05]" />
              ) : (
                <span aria-hidden="true" className="grid h-full place-items-center"><svg width="34" height="34" viewBox="0 0 40 40"><path d="M20 0 Q23 17 40 20 Q23 23 20 40 Q17 23 0 20 Q17 17 20 0Z" fill="#6A2CD6" /></svg></span>
              )}
            </span>
            <span className="flex flex-1 flex-col justify-between gap-1 px-2.5 py-2 sm:px-3.5 sm:py-3">
              <span className="line-clamp-2 min-h-[2.5em] text-[12.5px] font-semibold leading-tight text-[#2A0E5F] sm:text-[15px]">{category.name}</span>
              <span className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-[#EF5A8A] sm:text-[13px]">{category.minPricePaise !== null ? <>From {rupees(category.minPricePaise)}</> : "Coming soon"}</span>
                <ArrowRightIcon size={14} className="hidden shrink-0 text-[#6A2CD6] transition group-hover:translate-x-0.5 sm:block" />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </Container>
  );
}

function FeaturedProducts({ s, products }: { s: Settings; products: ProductCardData[] }) {
  const limit = Math.max(1, Math.min(24, Math.floor(num(s, "limit", 12))));
  return (
    <Container className="py-6 sm:py-8">
      <SectionHeading eyebrow="Curated" heading={str(s, "heading", "Trending on LOIMART")} subtitle={str(s, "subtitle", "Handpicked products from verified sellers")} actionLabel="View all" actionHref="/products" />
      {products.length ? (
        <ProductGrid products={products.slice(0, limit)} />
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">New products are on their way. Check back soon.</div>
      )}
    </Container>
  );
}

// Seller ads: hidden on days nobody has won a slot.
function SponsoredProducts({ s, items }: { s: Settings; items: HomeData["sponsoredProducts"] }) {
  if (!items.length) return null;
  const limit = Math.max(1, Math.min(20, Math.floor(num(s, "limit", 10))));
  return (
    <Container className="py-10 sm:py-14">
      <SectionHeading eyebrow="Sponsored" heading={str(s, "heading", "Sponsored picks")} subtitle={str(s, "subtitle", "Featured by LOIMART sellers")} />
      <SponsoredRow items={items.slice(0, limit)} />
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">{str(s, "eyebrow", "Why LOIMART")}</p>
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
          <div className="relative aspect-[4/3] bg-slate-200 lg:aspect-auto lg:min-h-full"><Image src={image} alt="" fill sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" unoptimized /></div>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-400">{str(s, "eyebrow", "Sell on LOIMART")}</p>
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
      <LazyVideo className="mt-6 aspect-video w-full rounded-2xl bg-black object-cover" src={url} />
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
