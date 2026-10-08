import Link from "next/link";
import ProductGallery from "./product-gallery";
import { notFound } from "next/navigation";
import { createDatabase, inventory, mediaAssets, productMedia, productVariants, products, sellers, categories } from "@azadimart/database";
import { and, asc, eq, ne } from "drizzle-orm";
import AddToCart from "./add-to-cart";
import ProductCard from "../../components/product-card";
import WishlistButton from "../../components/wishlist-button";

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

export const dynamic = "force-dynamic";

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { slug } = await params;
  const { variant: requestedVariantId } = await searchParams;
  const db = createDatabase();

  const rows = await db.select({
    id: products.id,
    title: products.title,
    slug: products.slug,
    description: products.description,
    categoryId: products.categoryId,
    categoryName: categories.name,
    sellerName: sellers.storeName,
    variantId: productVariants.id,
    variantTitle: productVariants.title,
    sku: productVariants.sku,
    pricePaise: productVariants.pricePaise,
    compareAtPaise: productVariants.compareAtPaise,
    onHand: inventory.onHand,
    reserved: inventory.reserved,
    mediaAssetId: productMedia.mediaAssetId,
    mediaKind: productMedia.kind,
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
  const hasDiscount = Boolean(selectedVariant.compareAtPaise && selectedVariant.compareAtPaise > selectedVariant.pricePaise);
  const discountPercent = hasDiscount ? Math.round((1 - selectedVariant.pricePaise / (selectedVariant.compareAtPaise ?? selectedVariant.pricePaise)) * 100) : 0;
  const relatedRows = onePerProduct(await db.select({
    id: products.id,
    title: products.title,
    slug: products.slug,
    pricePaise: productVariants.pricePaise,
    compareAtPaise: productVariants.compareAtPaise,
    mediaStorageKey: mediaAssets.storageKey,
    mediaAltText: mediaAssets.altText,
  }).from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(productMedia, and(eq(productMedia.productId, products.id), eq(productMedia.kind, "IMAGE")))
    .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
    .where(and(eq(products.status, "LIVE"), eq(productVariants.isActive, true), eq(products.categoryId, first.categoryId), ne(products.id, first.id)))
    .orderBy(asc(productMedia.sortOrder))
    .limit(160), 8);

  return (
    <main className="min-h-[60vh] bg-canvas px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <Link href="/products" className="text-sm font-semibold text-slate-500 hover:text-slate-950">← Back to marketplace</Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
          <div className="relative"><ProductGallery
            title={first.title}
            media={media.filter((item) => Boolean(item.mediaAssetId && item.mediaStorageKey && (item.mediaKind === "IMAGE" || item.mediaKind === "VIDEO"))).map((item) => ({ mediaAssetId: String(item.mediaAssetId), mediaStorageKey: String(item.mediaStorageKey), altText: item.altText, kind: item.mediaKind as "IMAGE" | "VIDEO" }))}
          />
          <div className="absolute right-3 top-3 z-10"><WishlistButton productId={first.id} /></div>
          </div>

          <section className="h-fit rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:p-8 lg:sticky lg:top-28">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">{first.categoryName}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-5xl">{first.title}</h1>
            <p className="mt-3 text-sm text-slate-500">Sold by <span className="font-semibold text-slate-800">{first.sellerName}</span></p>

            <div className="mt-6 flex flex-wrap items-end gap-3">
              <span className="text-3xl font-bold">{money(selectedVariant.pricePaise)}</span>
              {hasDiscount ? <span className="text-base text-slate-400 line-through">{money(selectedVariant.compareAtPaise!)}</span> : null}
              {hasDiscount ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{discountPercent}% off</span> : null}
            </div>
            <p className="mt-2 text-xs text-slate-400">Inclusive of applicable taxes • Final price shown at checkout</p>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Availability</p>
              <p className={`mt-1 font-bold ${availableQuantity > 0 ? "text-emerald-700" : "text-red-600"}`}>{availableQuantity > 0 ? availableQuantity < 5 ? `Only ${availableQuantity} left` : "In stock" : "Currently out of stock"}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Variant</p>
              {variants.length > 1 ? (
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Choose a variant">
                  {variants.map((variant) => {
                    const selected = variant.variantId === selectedVariant.variantId;
                    const inStock = stockOf(variant) > 0;
                    return (
                      <Link
                        key={variant.variantId}
                        href={"?variant=" + variant.variantId}
                        replace
                        scroll={false}
                        role="radio"
                        aria-checked={selected}
                        className={"rounded-full border px-3 py-1.5 text-xs font-bold " + (selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700") + (inStock ? "" : " line-through opacity-60")}
                      >
                        {variant.variantTitle} · {money(variant.pricePaise)}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1 font-semibold">{selectedVariant.variantTitle}</p>
              )}
              <p className="mt-1 text-xs text-slate-400">SKU {selectedVariant.sku}</p>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold">Seller trust</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                <span>✓ Verified seller</span><span>✓ Catalog quality review</span><span>✓ Secure checkout</span><span>✓ Customer support</span>
              </div>
            </div>

            {first.description ? <div className="mt-6"><p className="text-sm font-semibold">About this product</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{first.description}</p></div> : null}

            <div className="mt-7">
              <AddToCart key={selectedVariant.variantId} variantId={selectedVariant.variantId} availableQuantity={availableQuantity} />
            </div>
          </section>
        </div>

        {relatedRows.length > 0 ? (
          <section className="mt-12 border-t border-slate-200 pt-10">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">More to explore</p><h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">You may also like</h2></div>
              <Link href="/products" className="text-sm font-bold text-slate-500 hover:text-slate-950">View all →</Link>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {relatedRows.map((item) => <ProductCard key={item.id} product={item} />)}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
