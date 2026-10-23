import Link from "next/link";
import { ColorGallery, SelectedAddToCart, SelectedPrice, SelectedStock, VariantProvider } from "./variant-state";
import { notFound } from "next/navigation";
import { createDatabase, inventory, mediaAssets, productMedia, productVariants, products, sellers, categories, productAplusContent, productSummaries } from "@azadimart/database";
import { and, asc, desc, eq, inArray, ne, notInArray, or, type SQL } from "drizzle-orm";
import ProductCard from "../../components/product-card";
import { type AplusBlock, aplusComparedProductIds } from "@azadimart/shared";
import { AplusContent } from "@azadimart/ui";
import WishlistButton from "../../components/wishlist-button";
import { BadgeIcon, LockIcon, ShieldIcon, SupportIcon } from "../../components/icons";
import type { Metadata } from "next";
import { SITE_NAME, absoluteUrl, clip, jsonLd } from "../../lib/seo";
import { loadReviewPhotos, loadReviewSummary, loadReviews } from "../../lib/reviews";
import { RatingPill } from "../../components/stars";
import ReviewsSection from "./reviews-section";
import ShareButton from "./share-button";
import { loadCardBadges, loadCardCoupons, loadProductOffers } from "../../lib/offers";
import { OfferBadge } from "../../components/offer-badge";
import PageBanner from "../../components/page-banner";
import CouponChip from "../../components/coupon-chip";

/** Search title/description: the product's own SEO text if set, else built from name, price and seller. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const db = createDatabase();
    const row = (await db.select({
      title: products.title, description: products.description, specifications: products.specifications, metaTitle: products.metaTitle, metaDescription: products.metaDescription,
      categoryName: categories.name, sellerName: sellers.storeName, pricePaise: productVariants.pricePaise, imageKey: mediaAssets.storageKey,
    }).from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(sellers, eq(sellers.id, products.sellerId))
      .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.isActive, true)))
      .leftJoin(productMedia, and(eq(productMedia.productId, products.id), eq(productMedia.kind, "IMAGE")))
      .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
      .where(and(eq(products.slug, slug), eq(products.status, "LIVE")))
      .orderBy(asc(productVariants.pricePaise), asc(productMedia.sortOrder)).limit(1))[0];
    if (!row) return { title: "Product not found", robots: { index: false } };
    const price = "₹" + (row.pricePaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
    const title = row.metaTitle?.trim() || `${row.title} – Buy online at ${price}`;
    const description = clip(row.metaDescription?.trim() || `Buy ${row.title} for ${price} from ${row.sellerName}, a verified seller on LOIMART. ${clip(row.description || (row.specifications ?? []).slice(0, 4).map((r) => `${r.label}: ${r.value}`).join(", "), 90)} Cash on Delivery and easy returns.`);
    const image = row.imageKey ? absoluteUrl("/media/" + row.imageKey) : undefined;
    return {
      title,
      description,
      alternates: { canonical: "/products/" + slug },
      openGraph: { title, description, url: "/products/" + slug, siteName: SITE_NAME, locale: "en_IN", type: "website", ...(image ? { images: [{ url: image, width: 1000, height: 1000, alt: row.title }] } : {}) },
      twitter: { card: "summary_large_image", title, description, ...(image ? { images: [image] } : {}) },
    };
  } catch {
    return {};
  }
}

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

const RELATED_LIMIT = 8;

/**
 * "More to explore": products chosen by LOIMART for this product first (in
 * their order), then the same category, then related categories (parent,
 * sister and sub-categories), then popular products, up to 8 live products.
 */
async function moreToExplore(db: ReturnType<typeof createDatabase>, product: { id: string; categoryId: string; categoryParentId: string | null; relatedProductIds: string[] }) {
  const card = (where: SQL, order: "chosen" | "popular" | "newest") => db.select({
    id: products.id, title: products.title, slug: products.slug,
    pricePaise: productVariants.pricePaise, compareAtPaise: productVariants.compareAtPaise,
    mediaStorageKey: mediaAssets.storageKey, mediaAltText: mediaAssets.altText,
    reviewCount: products.reviewCount, ratingTotal: products.ratingTotal, categoryId: products.categoryId,
    priceDroppedAt: products.priceDroppedAt, priceBeforeDropPaise: products.priceBeforeDropPaise,
  }).from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(productMedia, and(eq(productMedia.productId, products.id), eq(productMedia.kind, "IMAGE")))
    .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
    .where(and(eq(products.status, "LIVE"), eq(productVariants.isActive, true), ne(products.id, product.id), where))
    .orderBy(...(order === "popular" ? [desc(products.reviewCount), desc(products.createdAt)] : order === "newest" ? [desc(products.createdAt)] : []), asc(productMedia.sortOrder))
    .limit(200);

  const picked: Awaited<ReturnType<typeof card>> = [];
  const add = (rows: typeof picked) => { for (const row of onePerProduct(rows, 200)) if (picked.length < RELATED_LIMIT && !picked.some((p) => p.id === row.id)) picked.push(row); };
  const taken = () => [product.id, ...picked.map((p) => p.id)];

  if (product.relatedProductIds.length) {
    const chosen = onePerProduct(await card(inArray(products.id, product.relatedProductIds), "chosen"), 200);
    add(product.relatedProductIds.map((id) => chosen.find((c) => c.id === id)).filter((c): c is (typeof chosen)[number] => Boolean(c)));
  }
  if (picked.length < RELATED_LIMIT) add(await card(and(eq(products.categoryId, product.categoryId), notInArray(products.id, taken()))!, "popular"));
  if (picked.length < RELATED_LIMIT) {
    const family = await db.select({ id: categories.id }).from(categories).where(or(
      product.categoryParentId ? eq(categories.id, product.categoryParentId) : undefined,
      product.categoryParentId ? eq(categories.parentId, product.categoryParentId) : undefined,
      eq(categories.parentId, product.categoryId),
    ));
    const ids = family.map((c) => c.id).filter((id) => id !== product.categoryId);
    if (ids.length) add(await card(and(inArray(products.categoryId, ids), notInArray(products.id, taken()))!, "popular"));
  }
  if (picked.length < RELATED_LIMIT) add(await card(notInArray(products.id, taken()), "popular"));
  return picked;
}

export const dynamic = "force-dynamic";


export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { slug } = await params;
  const { variant: requestedVariantId } = await searchParams;
  const db = createDatabase();

  const rows = await db.select({
    id: products.id,
    title: products.title,
    slug: products.slug,
    description: products.description,
    specifications: products.specifications,
    categoryId: products.categoryId,
    categoryName: categories.name,
    categorySlug: categories.slug,
    categoryParentId: categories.parentId,
    relatedProductIds: products.relatedProductIds,
    couponMaxDiscountPct: products.couponMaxDiscountPct,
    sellerId: products.sellerId,
    sellerName: sellers.storeName,
    priceDroppedAt: products.priceDroppedAt,
    priceBeforeDropPaise: products.priceBeforeDropPaise,
    variantId: productVariants.id,
    variantTitle: productVariants.title,
    sku: productVariants.sku,
    pricePaise: productVariants.pricePaise,
    compareAtPaise: productVariants.compareAtPaise,
    attributes: productVariants.attributes,
    variantCreatedAt: productVariants.createdAt,
    onHand: inventory.onHand,
    reserved: inventory.reserved,
    mediaAssetId: productMedia.mediaAssetId,
    mediaKind: productMedia.kind,
    mediaColor: productMedia.color,
    mediaStorageKey: mediaAssets.storageKey,
    altText: mediaAssets.altText,
  }).from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(sellers, eq(sellers.id, products.sellerId))
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .leftJoin(productMedia, eq(productMedia.productId, products.id))
    .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
    .where(and(eq(products.slug, slug), eq(products.status, "LIVE"), eq(productVariants.isActive, true)))
    .orderBy(asc(productMedia.sortOrder));

  const first = rows[0];
  if (!first) notFound();

  const variants = rows.filter((row, index, all) => all.findIndex((candidate) => candidate.variantId === row.variantId) === index);
  const media = rows.filter((row, index, all) => row.mediaAssetId && all.findIndex((candidate) => candidate.mediaAssetId === row.mediaAssetId) === index);
  // Stable order (price, then id); honour ?variant=, else the first one in stock.
  variants.sort((a, b) => a.pricePaise - b.pricePaise || a.variantId.localeCompare(b.variantId));
  const stockOf = (variant: (typeof variants)[number]) => Math.max(0, (variant.onHand ?? 0) - (variant.reserved ?? 0));
  const selectedVariant = variants.find((variant) => variant.variantId === requestedVariantId)
    ?? variants.find((variant) => stockOf(variant) > 0)
    ?? variants[0];
  if (!selectedVariant) notFound();
  const availableQuantity = Math.max(0, (selectedVariant.onHand ?? 0) - (selectedVariant.reserved ?? 0));
  // Colours/sizes: the picker lists options in the seller's order; the gallery shows the chosen colour's photos.
  const hasOptions = variants.some((v) => v.attributes?.color || v.attributes?.size);
  const pickerVariants = [...variants].sort((a, b) => (hasOptions ? a.variantCreatedAt.getTime() - b.variantCreatedAt.getTime() : 0) || a.pricePaise - b.pricePaise || a.variantId.localeCompare(b.variantId))
    .map((v) => ({ id: v.variantId, title: v.variantTitle, sku: v.sku, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise, stock: stockOf(v), color: v.attributes?.color, colorHex: v.attributes?.colorHex, size: v.attributes?.size, sizeLabel: v.attributes?.sizeLabel }));

  const relatedRows = await moreToExplore(db, first);

  const lowestPrice = Math.min(...variants.map((v) => v.pricePaise));
  const [reviewSummary, reviewPage, reviewPhotos, offers, relatedBadges, relatedCoupons] = await Promise.all([
    loadReviewSummary(db, first.id), loadReviews(db, first.id), loadReviewPhotos(db, first.id),
    loadProductOffers(db, { id: first.id, categoryId: first.categoryId, sellerId: first.sellerId, couponMaxDiscountPct: first.couponMaxDiscountPct, pricePaise: lowestPrice, priceDroppedAt: first.priceDroppedAt, priceBeforeDropPaise: first.priceBeforeDropPaise }),
    loadCardBadges(db, relatedRows),
    loadCardCoupons(db, relatedRows),
  ]);

  // Approved A+ content only; comparison columns show LIVE products.
  const aplusRow = (await db.select({ blocks: productAplusContent.blocks }).from(productAplusContent).where(eq(productAplusContent.productId, first.id)).limit(1))[0];
  const aplusBlocks = (aplusRow?.blocks ?? []) as AplusBlock[];
  const aplusSummaries = aplusBlocks.length ? await productSummaries(db, [first.id, ...aplusComparedProductIds(aplusBlocks)]) : {};
  const aplusCompared = Object.fromEntries(Object.values(aplusSummaries).filter((summary) => summary.status === "LIVE" && summary.id !== first.id).map((summary) => [summary.id, { ...summary, href: "/products/" + summary.slug }]));

  return (
    <>
    <PageBanner pageKey="product" />
    <main className="min-h-[60vh] bg-white px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-[1440px]">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-900">Home</Link><span className="mx-1.5">/</span>
          <Link href={"/c/" + first.categorySlug} className="hover:text-slate-900">{first.categoryName}</Link><span className="mx-1.5">/</span>
          <span className="text-slate-900">{first.title}</span>
        </nav>
        {/* Product and breadcrumb structured data: lets Google show price, stock and the category trail in results. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd([
          {
            "@context": "https://schema.org",
            "@type": "Product",
            name: first.title,
            description: clip(first.description || (first.specifications ?? []).map((r) => `${r.label}: ${r.value}`).join("; ") || first.title, 500),
            sku: selectedVariant.sku,
            category: first.categoryName,
            ...(first.specifications?.length ? { additionalProperty: first.specifications.slice(0, 20).map((row) => ({ "@type": "PropertyValue", name: row.label, value: row.value })) } : {}),
            image: media.filter((m) => m.mediaKind === "IMAGE" && m.mediaStorageKey).slice(0, 8).map((m) => absoluteUrl("/media/" + m.mediaStorageKey)),
            offers: {
              "@type": "Offer",
              url: absoluteUrl("/products/" + first.slug),
              priceCurrency: "INR",
              price: (selectedVariant.pricePaise / 100).toFixed(2),
              availability: availableQuantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              itemCondition: "https://schema.org/NewCondition",
              seller: { "@type": "Organization", name: first.sellerName },
            },
            ...(reviewSummary.count ? {
              aggregateRating: { "@type": "AggregateRating", ratingValue: reviewSummary.average.toFixed(1), reviewCount: reviewSummary.count, bestRating: 5, worstRating: 1 },
              // Only verified LOIMART reviews go to search engines (never imported ones).
              review: reviewPage.items.filter((r) => r.source === "VERIFIED_PURCHASE").slice(0, 5).map((r) => ({
                "@type": "Review",
                reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
                author: { "@type": "Person", name: r.authorName },
                datePublished: r.createdAt.slice(0, 10),
                ...(r.title ? { name: r.title } : {}),
                ...(r.body ? { reviewBody: clip(r.body, 500) } : {}),
              })),
            } : {}),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
              { "@type": "ListItem", position: 2, name: first.categoryName, item: absoluteUrl("/c/" + first.categorySlug) },
              { "@type": "ListItem", position: 3, name: first.title, item: absoluteUrl("/products/" + first.slug) },
            ],
          },
        ])} />

        <VariantProvider variants={pickerVariants} initialId={selectedVariant.variantId}>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 [&>*]:min-w-0">
          <div className="relative"><ColorGallery
            title={first.title}
            media={media.filter((item) => Boolean(item.mediaAssetId && item.mediaStorageKey && (item.mediaKind === "IMAGE" || item.mediaKind === "VIDEO"))).map((item) => ({ mediaAssetId: String(item.mediaAssetId), mediaStorageKey: String(item.mediaStorageKey), altText: item.altText, kind: item.mediaKind as "IMAGE" | "VIDEO", color: item.mediaColor }))}
          />
          <div className="absolute right-3 top-3 z-10"><WishlistButton productId={first.id} /></div>
          </div>

          <section className="h-fit bg-white lg:sticky lg:top-28 lg:pt-2">
            {offers.tags.length || offers.priceDrop ? (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {offers.tags.map((tag) => <OfferBadge key={tag.label} badge={tag} size="md" />)}
                {offers.priceDrop ? <OfferBadge badge={{ label: "Price drop", tone: "GREEN", kind: "price_drop" }} size="md" /> : null}
              </div>
            ) : null}
            <h1 className="text-xl font-semibold leading-snug text-slate-950 sm:text-[28px]">{first.title}</h1>
            <p className="mt-2 text-xs text-slate-400">Sold by <span className="text-slate-600">{first.sellerName}</span> · <Link href={"/c/" + first.categorySlug} className="hover:text-slate-900">{first.categoryName}</Link></p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
              {reviewSummary.count ? <a href="#reviews" className="inline-flex hover:opacity-80"><RatingPill average={reviewSummary.average} count={reviewSummary.count} /></a> : <span />}
              <ShareButton path={"/products/" + first.slug} title={first.title} pricePaise={selectedVariant.pricePaise} />
            </div>

            <SelectedPrice lowestPrice={lowestPrice} priceDrop={offers.priceDrop ? { savedPaise: offers.priceDrop.savedPaise, beforePaise: offers.priceDrop.beforePaise } : null} />
            <p className="mt-2 text-xs text-slate-400">Inclusive of applicable taxes • Final price shown at checkout</p>
            {offers.coupons.length ? (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="text-sm font-bold text-slate-950">Available offers</p>
                <ul className="mt-2.5 space-y-2.5">
                  {offers.coupons.map((c) => (
                    <li key={c.code}><CouponChip code={c.code} text={c.text} size="offer" /></li>
                  ))}
                </ul>
              </div>
            ) : null}

            <SelectedStock hasOptions={hasOptions} />

            {/* Buttons first, so Buy now is reached without scrolling past the description. */}
            <div className="mt-7">
              <SelectedAddToCart />
            </div>
            {/* Trust markers, highlighted right under the buttons where shoppers decide to buy. */}
            <section aria-label="The loimart promise" className="mt-6 border-y border-slate-200 py-4">
              <ul className="grid grid-cols-4 gap-2 sm:gap-3">
                {[
                  { Icon: BadgeIcon, label: "Verified seller", note: "KYC-checked" },
                  { Icon: ShieldIcon, label: "Quality checked", note: "Before listing" },
                  { Icon: LockIcon, label: "Secure checkout", note: "COD available" },
                  { Icon: SupportIcon, label: "Customer support", note: "Live chat help" },
                ].map(({ Icon, label, note }) => (
                  <li key={label} className="flex flex-col items-center gap-1 text-center">
                    <Icon size={24} className="text-slate-800" />
                    <span className="text-[11px] font-semibold leading-tight text-slate-900 sm:text-xs">{label}</span>
                    <span className="text-[10px] leading-tight text-slate-500 sm:text-[11px]">{note}</span>
                  </li>
                ))}
              </ul>
            </section>

            {first.description ? <div className="mt-6"><p className="text-sm font-semibold">About this product</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{first.description}</p></div> : null}
            {first.specifications?.length ? (
              <div className="mt-6">
                <p className="text-sm font-semibold">Specifications</p>
                {/* Seller rows are plain text rendered by React (escaped), never seller HTML. */}
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {first.specifications.map((row, i) => (
                      <tr key={i}>
                        <th scope="row" className="w-[38%] border-b border-slate-100 py-2.5 pr-3 text-left align-top font-normal text-slate-500">{row.label}</th>
                        <td className="whitespace-pre-line border-b border-slate-100 py-2.5 align-top text-slate-900">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

          </section>
        </div>
        </VariantProvider>

        {aplusBlocks.length ? (
          <section aria-label="From the seller" className="mt-12 border-t border-slate-200 pt-10">
            <h2 className="mb-6 text-[22px] font-bold tracking-[-0.01em] sm:text-[28px]">Product details</h2>
            <AplusContent blocks={aplusBlocks} product={{ id: first.id, title: first.title, imageUrl: aplusSummaries[first.id]?.imageUrl ?? null, pricePaise: selectedVariant.pricePaise }} compared={aplusCompared} />
          </section>
        ) : null}

        <ReviewsSection productId={first.id} slug={first.slug} productTitle={first.title} summary={reviewSummary} initial={reviewPage} photos={reviewPhotos} />

        {relatedRows.length > 0 ? (
          <section className="mt-12 border-t border-slate-200 pt-10">
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-[22px] font-bold tracking-[-0.01em] sm:text-[28px]">You may also like</h2>
              <Link href="/products" className="text-sm font-bold text-slate-500 hover:text-slate-950">View all →</Link>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-1.5 gap-y-6 sm:gap-x-2 sm:gap-y-8 sm:grid-cols-4">
              {relatedRows.map((item) => <ProductCard key={item.id} product={{ ...item, badge: relatedBadges[item.id] ?? null, coupon: relatedCoupons[item.id] ?? null }} />)}
            </div>
          </section>
        ) : null}
      </div>
    </main>
    </>
  );
}
