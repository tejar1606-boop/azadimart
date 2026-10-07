import CouponCard from "./components/coupon-card";
import Image from "next/image";
import Link from "next/link";
import {
  createDatabase,
  coupons,
  navigation,
  navigationItems as navItemTable,
  pageSections,
  pages,
  productMedia,
  productVariants,
  products,
  mediaAssets,
  themes,
} from "@azadimart/database";
import { and, asc, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Settings = Record<string, unknown>;
type HomeSection = { id: string; type: string; position: number; isVisible: boolean; settings: Settings };
type HomeCoupon = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  discountType: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  discountValue: number;
  minimumOrderPaise: number;
  startsAt: Date;
  endsAt: Date | null;
};
type HomeProduct = {
  id: string;
  title: string;
  slug: string;
  pricePaise: number;
  mediaStorageKey: string | null;
  mediaAltText: string | null;
};
type HomeNav = { id: string; label: string; href: string | null; isActive: boolean };

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const str = (settings: Settings, key: string, fallback = "") =>
  typeof settings[key] === "string" ? String(settings[key]) : fallback;
const num = (settings: Settings, key: string, fallback: number) =>
  typeof settings[key] === "number" && Number.isFinite(settings[key]) ? Number(settings[key]) : fallback;

async function getHome() {
  const db = createDatabase();
  const theme = (await db.select().from(themes).where(eq(themes.status, "PUBLISHED")).limit(1))[0];
  if (!theme) return { themeSettings: {}, sections: [], coupons: [], products: [], navigationItems: [] as HomeNav[] };

  const page = (
    await db.select().from(pages).where(and(
      eq(pages.themeId, theme.id),
      eq(pages.slug, "home"),
      eq(pages.status, "PUBLISHED"),
    )).limit(1)
  )[0];

  const nav = (
    await db.select({ id: navigation.id }).from(navigation).where(and(
      eq(navigation.themeId, theme.id),
      eq(navigation.handle, "main-menu"),
    )).limit(1)
  )[0];

  const navRows = nav
    ? await db.select({
        id: navItemTable.id,
        label: navItemTable.label,
        href: navItemTable.href,
        isActive: navItemTable.isActive,
      }).from(navItemTable).where(eq(navItemTable.navigationId, nav.id)).orderBy(asc(navItemTable.position))
    : [];

  const visibleNavigation: HomeNav[] = navRows.filter(
    (item): item is HomeNav => item.isActive && Boolean(item.href),
  );

  if (!page) return {
    themeSettings: (theme.settings ?? {}) as Settings,
    sections: [],
    coupons: [],
    products: [],
    navigationItems: visibleNavigation,
  };

  const sections: HomeSection[] = (await db.select().from(pageSections)
    .where(eq(pageSections.pageId, page.id))
    .orderBy(asc(pageSections.position)))
    .map((section) => ({
      id: section.id,
      type: section.type,
      position: section.position,
      isVisible: section.isVisible,
      settings: (section.settings ?? {}) as Settings,
    }));

  const now = new Date();
  const couponRows = await db.select({
    id: coupons.id,
    code: coupons.code,
    title: coupons.title,
    description: coupons.description,
    discountType: coupons.discountType,
    discountValue: coupons.discountValue,
    minimumOrderPaise: coupons.minimumOrderPaise,
    startsAt: coupons.startsAt,
    endsAt: coupons.endsAt,
  }).from(coupons).where(eq(coupons.isActive, true)).orderBy(desc(coupons.createdAt)).limit(24);

  const activeCoupons: HomeCoupon[] = couponRows
    .filter((coupon) => coupon.startsAt <= now && (!coupon.endsAt || coupon.endsAt > now))
    .slice(0, 12);

  const liveProducts: HomeProduct[] = await db.select({
    id: products.id,
    title: products.title,
    slug: products.slug,
    pricePaise: productVariants.pricePaise,
    mediaStorageKey: mediaAssets.storageKey,
    mediaAltText: mediaAssets.altText,
  }).from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(productMedia, and(eq(productMedia.productId, products.id), eq(productMedia.kind, "IMAGE")))
    .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
    .where(eq(products.status, "LIVE"))
    .orderBy(desc(products.createdAt))
    .limit(12);

  return {
    themeSettings: (theme.settings ?? {}) as Settings,
    sections,
    coupons: activeCoupons,
    products: liveProducts,
    navigationItems: visibleNavigation,
  };
}

export default async function HomePage() {
  const data = await getHome();
  const announcement = str(data.themeSettings, "announcement", "Built for India • Trusted sellers • Secure checkout");

  return (
    <main className="min-h-screen bg-[#f8f7f3] text-slate-950">
      <div className="bg-slate-950 px-4 py-2 text-center text-[11px] font-medium tracking-wide text-white/80">{announcement}</div>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:gap-8">
          <Link href="/" className="shrink-0 text-xl font-black tracking-[-0.04em]">Azadi<span className="text-amber-500">Mart</span></Link>
          <nav className="hidden min-w-0 flex-1 items-center gap-6 lg:flex">
            {data.navigationItems.map((item) => (
              <Link key={item.id} href={item.href ?? "/"} className="text-sm font-medium text-slate-600 transition hover:text-slate-950">{item.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link href="/products" className="hidden min-w-36 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-left text-xs text-slate-400 transition hover:border-slate-300 sm:block">Search products</Link>
            <Link href="/products" className="rounded-full bg-slate-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 sm:px-5">Shop</Link>
          </div>
        </div>
        <div className="border-t border-slate-100 px-4 py-2.5 lg:hidden">
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
            {data.navigationItems.map((item) => (
              <Link key={"mobile-" + item.id} href={item.href ?? "/"} className="shrink-0 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600">{item.label}</Link>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {data.sections.length === 0 ? (
          <DefaultHero />
        ) : (
          data.sections.filter((section) => section.isVisible).map((section) => (
            <StoreSection key={section.id} section={section} coupons={data.coupons} products={data.products} />
          ))
        )}

        <footer className="border-t border-slate-200 py-10 sm:py-14">
          <div className="grid gap-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <p className="text-lg font-black">Azadi<span className="text-amber-500">Mart</span></p>
              <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">A modern Indian marketplace built around verified sellers, thoughtful merchandising and a trustworthy customer experience.</p>
            </div>
            <FooterColumn title="Shop" />
            <FooterColumn title="AzadiMart" />
            <FooterColumn title="Trust" />
          </div>
          <div className="mt-10 flex flex-col gap-2 border-t border-slate-200 pt-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} AzadiMart. Built for India.</span>
            <span>Responsive by design • Mobile + desktop</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function FooterColumn({ title }: { title: string }) {
  const links = title === "Shop"
    ? ["All products", "New arrivals", "Collections", "Coupons"]
    : title === "AzadiMart"
      ? ["About us", "Sell on AzadiMart", "Support", "Contact"]
      : ["Shipping", "Returns", "Privacy", "Terms"];
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{title}</p>
      <div className="mt-3 space-y-2.5">{links.map((link) => <Link key={link} href="/products" className="block text-sm text-slate-600 hover:text-slate-950">{link}</Link>)}</div>
    </div>
  );
}

function DefaultHero() {
  return (
    <section className="relative isolate my-6 overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-12 text-white shadow-[0_30px_80px_rgba(15,23,42,0.16)] sm:px-10 sm:py-16 lg:my-8 lg:min-h-[610px] lg:px-14 lg:py-20">
      <div className="absolute -right-28 -top-20 -z-10 h-80 w-80 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="absolute -bottom-28 left-1/3 -z-10 h-96 w-96 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="absolute right-8 top-10 hidden h-[420px] w-[300px] rotate-6 rounded-[2rem] border border-white/10 bg-white/[0.04] backdrop-blur lg:block" />
      <div className="max-w-3xl">
        <div className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">Built for India • Designed for the world</div>
        <h1 className="mt-6 text-4xl font-black leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-7xl">One marketplace.<br /><span className="text-white/55">A billion possibilities.</span></h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Discover products from verified sellers across farming, fashion, home, beauty and more — brought together in one trusted shopping experience.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/products" className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100">Explore marketplace</Link>
          <Link href="/seller" className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold transition hover:bg-white/10">Become a seller</Link>
        </div>
        <div className="mt-12 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Verified", "Seller network"],
            ["Curated", "Product catalog"],
            ["Secure", "Checkout"],
            ["Local", "Indian businesses"],
          ].map(([title, subtitle]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-sm font-bold">{title}</p><p className="mt-1 text-[11px] text-slate-400">{subtitle}</p></div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StoreSection({ section, coupons, products: liveProducts }: { section: HomeSection; coupons: HomeCoupon[]; products: HomeProduct[] }) {
  const s = section.settings;
  const categories = Array.isArray(s.categories) ? s.categories.filter((v): v is string => typeof v === "string") : [];
  const items = Array.isArray(s.items) ? s.items.filter((v): v is string => typeof v === "string") : [];
  const limit = Math.max(1, Math.min(12, Math.floor(num(s, "limit", 8))));

  if (section.type === "hero") return (
    <section className="relative isolate my-6 overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-12 text-white shadow-[0_25px_60px_rgba(15,23,42,0.14)] sm:px-10 sm:py-16 lg:my-8 lg:min-h-[600px] lg:px-14 lg:py-20">
      <div className="absolute -right-20 top-10 -z-10 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="max-w-4xl">
        <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">{str(s, "eyebrow", "Made for India")}</span>
        <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-7xl">{str(s, "heading", "Everything India. One trusted marketplace.")}</h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{str(s, "description", "Discover products from verified sellers across farming, fashion, home and beauty.")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={str(s, "primaryHref", "/products")} className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950">{str(s, "primaryLabel", "Shop now")}</Link>
          {str(s, "secondaryLabel") ? <Link href={str(s, "secondaryHref", "/seller")} className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold">{str(s, "secondaryLabel")}</Link> : null}
        </div>
        <div className="mt-12 flex flex-wrap gap-2">
          {[str(s, "badge", "Verified sellers"), "Quality-controlled catalog", "Secure payments"].map((item) => <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-semibold text-slate-300">{item}</span>)}
        </div>
      </div>
    </section>
  );

  if (section.type === "category_grid") return (
    <section className="py-10 sm:py-14">
      <SectionHeading eyebrow="Discover" heading={str(s, "heading", "Shop by category")} subtitle={str(s, "subtitle", "Built around everyday India")} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {categories.map((category, index) => (
          <Link href="/products" key={category} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">0{index + 1}</span>
            <p className="mt-8 text-base font-bold tracking-tight">{category}</p>
            <span className="mt-5 block text-xs font-semibold text-slate-400 transition group-hover:text-slate-950">Explore →</span>
          </Link>
        ))}
      </div>
    </section>
  );

  if (section.type === "trust_strip") return (
    <section className="border-y border-slate-200 py-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.slice(0, 4).map((item) => <div key={item} className="flex items-center gap-3 rounded-xl bg-white/60 px-4 py-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-950 text-[11px] font-black text-white">✓</span><span className="text-sm font-semibold text-slate-700">{item}</span></div>)}
      </div>
    </section>
  );

  if (section.type === "featured_products") return (
    <section className="py-10 sm:py-14">
      <SectionHeading eyebrow="Curated" heading={str(s, "heading", "Featured on AzadiMart")} subtitle={str(s, "subtitle", "Handpicked products from active sellers")} actionLabel="View all" actionHref="/products" />
      {liveProducts.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Products will appear here as sellers pass quality review and become live.</div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {liveProducts.slice(0, limit).map((product) => (
            <Link href={"/products/" + product.slug} key={product.id} className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="relative aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 via-white to-amber-50">
                {product.mediaStorageKey ? (
                  <Image
                    src={"/media/" + product.mediaStorageKey}
                    alt={product.mediaAltText ?? product.title}
                    fill
                    sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 23vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span className="grid h-full place-items-center text-4xl font-black text-slate-200">{product.title.slice(0, 1).toUpperCase()}</span>
                )}
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-500">Verified seller</span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm font-semibold leading-5">{product.title}</p>
              <p className="mt-1 text-base font-black">{money(product.pricePaise)}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );

  if (section.type === "sales_coupons") return (
    <section className="my-8 rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 sm:p-7">
      <SectionHeading eyebrow="Offers" heading={str(s, "heading", "Save more with AzadiMart coupons")} subtitle={str(s, "subtitle", "Copy a code and apply it at checkout.")} />
      {coupons.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-amber-200 bg-white/70 p-8 text-sm text-slate-500">New offers will appear here when campaigns are active.</div> : <div className="mt-6 grid gap-3 md:grid-cols-2">{coupons.slice(0, limit).map((coupon) => <CouponCard key={coupon.id} coupon={coupon} />)}</div>}
    </section>
  );

  if (section.type === "image_banner") return (
    <section className="my-8 overflow-hidden rounded-[2rem] bg-slate-900 p-7 text-white sm:p-10 lg:p-14">
      <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">{str(s, "eyebrow", "Proudly Indian")}</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.035em] sm:text-4xl lg:text-5xl">{str(s, "heading", "Support Indian sellers. Grow local.")}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{str(s, "description", "A marketplace designed to give Indian businesses a digital storefront.")}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Marketplace principle</p><p className="mt-3 text-xl font-bold leading-7">Trust first. Great products second. Growth follows.</p></div>
      </div>
      <Link href={str(s, "buttonHref", "/products")} className="mt-8 inline-flex rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950">{str(s, "buttonLabel", "Explore collections")}</Link>
    </section>
  );

  if (section.type === "seller_cta") return (
    <section className="my-8 rounded-[2rem] border border-slate-200 bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:p-10 lg:p-12">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">{str(s, "eyebrow", "Built for ambitious sellers")}</p><h2 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.035em] sm:text-4xl">{str(s, "heading", "Take your business online with AzadiMart.")}</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">{str(s, "description", "A professional storefront, catalog tools, QC workflow and marketplace reach in one place.")}</p></div>
        <div className="flex flex-wrap gap-3"><Link href={str(s, "primaryHref", "/seller")} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">{str(s, "primaryLabel", "Start selling")}</Link><Link href={str(s, "secondaryHref", "/seller")} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">{str(s, "secondaryLabel", "Learn more")}</Link></div>
      </div>
    </section>
  );

  if (section.type === "newsletter") return (
    <section className="my-8 rounded-[2rem] bg-slate-950 p-7 text-white sm:p-10">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div><h2 className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">{str(s, "heading", "Stay in the loop")}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{str(s, "description", "Get early access to new collections and major offers.")}</p></div><div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row"><input className="min-h-11 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-500" placeholder="Your email address" /><button type="button" className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950">{str(s, "buttonLabel", "Notify me")}</button></div></div>
    </section>
  );

  return <section className="py-8"><SectionHeading eyebrow="AzadiMart" heading={str(s, "heading", section.type)} subtitle={str(s, "description", str(s, "subtitle", ""))} /></section>;
}

function SectionHeading({ eyebrow, heading, subtitle, actionLabel, actionHref }: { eyebrow: string; heading: string; subtitle?: string; actionLabel?: string; actionHref?: string }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">{eyebrow}</p><h2 className="mt-2 text-2xl font-black tracking-[-0.03em] sm:text-3xl">{heading}</h2>{subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}</div>{actionLabel && actionHref ? <Link href={actionHref} className="text-sm font-semibold text-slate-600 hover:text-slate-950">{actionLabel} →</Link> : null}</div>;
}