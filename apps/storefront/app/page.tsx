import Image from "next/image";
import Link from "next/link";
import {
  categories,
  coupons,
  createDatabase,
  mediaAssets,
  pageSections,
  pages,
  productMedia,
  productVariants,
  products,
  sellers,
  themes,
} from "@azadimart/database";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import CouponCard from "./components/coupon-card";
import { ArrowRightIcon, BadgeIcon, CashIcon, CheckIcon, ReturnIcon, ShieldIcon } from "./components/icons";
import ProductCard, { type ProductCardData } from "./components/product-card";

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
type HomeCategory = { id: string; name: string; imageKey: string | null; productCount: number };

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
    }).from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .innerJoin(sellers, eq(sellers.id, products.sellerId))
      .leftJoin(productMedia, and(eq(productMedia.productId, products.id), eq(productMedia.kind, "IMAGE")))
      .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
      .where(and(eq(products.status, "LIVE"), eq(productVariants.isActive, true)))
      .orderBy(desc(products.createdAt), asc(productMedia.sortOrder))
      .limit(400),
    db.select({ id: categories.id, name: categories.name })
      .from(categories).where(and(eq(categories.isActive, true), isNull(categories.parentId)))
      .orderBy(asc(categories.sortOrder), asc(categories.name)).limit(24),
  ]);

  const liveProducts = onePerProduct(productRows, 24);

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

  return { sections, coupons: activeCoupons, products: liveProducts as ProductCardData[], categories: homeCategories };
}

type HomeData = Awaited<ReturnType<typeof getHome>>;

export default async function HomePage() {
  const data = await getHome();
  const sections = data.sections.length ? data.sections : FALLBACK_SECTIONS;
  const showsProducts = sections.some((section) => section.type === "featured_products");

  return (
    <main className="bg-canvas">
      {sections.map((section) => <StoreSection key={section.id} section={section} data={data} />)}
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
  return <div className={"mx-auto max-w-7xl px-4 sm:px-6 " + className}>{children}</div>;
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
    case "hero": return <Hero s={s} />;
    case "marquee": return <Marquee s={s} />;
    case "promo_banner": return <PromoBanner s={s} />;
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

function Hero({ s }: { s: Settings }) {
  const heading = str(s, "heading", "Everything India loves, from sellers you can trust.");
  const description = str(s, "description", "Shop quality-checked products from KYC-verified Indian sellers. Cash on Delivery and easy returns on every order.");
  const primaryLabel = str(s, "primaryLabel", "Shop now");
  const primaryHref = str(s, "primaryHref", "/products");
  const desktopImage = str(s, "desktopImageUrl");
  const desktopVideo = str(s, "desktopVideoUrl");
  const mobileImage = str(s, "mobileImageUrl", desktopImage);
  const mobileVideo = str(s, "mobileVideoUrl", str(s, "mobileImageUrl") ? "" : desktopVideo);

  // A campaign banner (image 2880 × 1080 / 1200 × 1500, or video) takes over the hero, full width.
  if (desktopImage || desktopVideo) {
    return (
      <section aria-label="Featured campaign">
        <Link href={resolveHref(primaryHref)} className="block bg-slate-200">
          <BannerArt image={mobileImage} video={mobileVideo} alt={heading} priority className="block aspect-[4/5] sm:hidden" />
          <BannerArt image={desktopImage} video={desktopVideo} alt={heading} priority className="hidden aspect-[8/3] sm:block" />
        </Link>
      </section>
    );
  }

  // No banner uploaded yet: a designed banner in the same frame (8:3 desktop,
  // 4:5 mobile) so the layout does not change when one is uploaded.
  return (
    <section aria-label="Welcome">
      <div className="relative isolate overflow-hidden bg-chrome text-white">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,rgba(229,133,48,0.55),transparent_55%),radial-gradient(ellipse_at_10%_90%,rgba(24,102,78,0.55),transparent_55%)]" />
        <div aria-hidden className="absolute -right-24 top-1/2 -z-10 hidden h-[140%] w-1/2 -translate-y-1/2 rounded-full border border-white/10 sm:block" />
        <div aria-hidden className="absolute -right-4 top-1/2 -z-10 hidden h-[95%] w-1/3 -translate-y-1/2 rounded-full border border-white/10 sm:block" />
        <div className="mx-auto flex aspect-[4/5] max-w-7xl flex-col justify-end px-5 pb-10 sm:aspect-[8/3] sm:justify-center sm:px-6 sm:pb-0">
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
      <div className="border-b border-slate-200 bg-white">
        <ul className="mx-auto grid max-w-7xl grid-cols-3 gap-3 px-4 py-4 sm:px-6">
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
  const href = str(s, "href");
  const images = (
    <>
      <BannerArt image={mobile} video={mobileVideo} alt={alt} className="block aspect-[800/329] sm:hidden" />
      <BannerArt image={desktop} video={desktopVideo} alt={alt} className="hidden aspect-[1800/320] sm:block" />
    </>
  );
  return (
    <Container className="py-4 sm:py-6">
      {href ? (
        <Link href={resolveHref(href)} className="block overflow-hidden rounded-xl bg-slate-200 transition hover:opacity-95">{images}</Link>
      ) : (
        <div className="overflow-hidden rounded-xl bg-slate-200">{images}</div>
      )}
    </Container>
  );
}

function Marquee({ s }: { s: Settings }) {
  const items = list(s, "items");
  const messages = items.length ? items : ["Cash on Delivery available", "KYC-verified sellers", "Quality-checked products", "Easy 7-day returns", "Secure checkout"];
  const row = [...messages, ...messages];
  return (
    <section aria-label="Highlights" className="overflow-hidden bg-black py-3 text-white">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap motion-reduce:animate-none">
        {[...row, ...row].map((item, index) => (
          <span key={index} aria-hidden={index >= messages.length} className="flex items-center gap-10 text-[13px] font-medium uppercase tracking-[0.12em]">
            {item}<span className="text-brand">✦</span>
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
          <Link key={category.id} href={"/products?categoryId=" + category.id} className={"group relative flex flex-col " + (tiles.length >= 3 ? "aspect-[4/5]" : "aspect-[16/9] sm:aspect-[2/1]") + " justify-end overflow-hidden bg-gradient-to-br p-4 sm:p-5 " + TILE_TINTS[index % TILE_TINTS.length]}>
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
        <div className="flex flex-col justify-center bg-brand p-8 text-white sm:p-12">
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

function TrustStrip({ s }: { s: Settings }) {
  const items = list(s, "items").slice(0, 4);
  if (!items.length) return null;
  return (
    <section className="border-y border-slate-200 bg-white">
      <Container className="grid grid-cols-2 gap-4 py-5 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-3 text-sm font-medium text-slate-800">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-india-light text-india"><CheckIcon size={16} /></span>{item}
          </div>
        ))}
      </Container>
    </section>
  );
}

function SellerCta({ s }: { s: Settings }) {
  return (
    <Container className="py-10 sm:py-14">
      <div className="relative overflow-hidden bg-[#111111] p-8 text-white sm:p-12">
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/25 blur-3xl" />
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
