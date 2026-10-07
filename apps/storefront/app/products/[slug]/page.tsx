import Link from "next/link";
import { notFound } from "next/navigation";
import { createDatabase, inventory, mediaAssets, productMedia, productVariants, products, sellers, categories } from "@azadimart/database";
import { and, asc, eq } from "drizzle-orm";
import AddToCart from "./add-to-cart";

export const dynamic = "force-dynamic";

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createDatabase();

  const rows = await db.select({
    id: products.id,
    title: products.title,
    slug: products.slug,
    description: products.description,
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
  const selectedVariant = variants[0];
  if (!selectedVariant) notFound();
  const availableQuantity = Math.max(0, (selectedVariant.onHand ?? 0) - (selectedVariant.reserved ?? 0));

  return (
    <main className="min-h-screen bg-[#f8f7f3] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <Link href="/products" className="text-sm font-semibold text-slate-500 hover:text-slate-950">← Back to marketplace</Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
          <section className="grid gap-3 sm:grid-cols-2">
            {(media.length > 0 ? media.slice(0, 8) : [null]).map((item, index) => (
              <div key={item?.mediaAssetId ?? "placeholder"} className={`relative grid aspect-square place-items-center overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white ${index === 0 ? "sm:col-span-2" : ""}`}>
                {item?.mediaStorageKey && item.mediaKind === "IMAGE" ? <img src={"/media/" + item.mediaStorageKey} alt={item.altText ?? first.title} className="h-full w-full object-cover" /> : <span className="text-7xl font-black tracking-[-0.08em] text-slate-100">{first.title.slice(0, 1).toUpperCase()}</span>}
                {index === 0 ? <span className="absolute left-4 top-4 rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">Quality checked</span> : null}
              </div>
            ))}
          </section>

          <section className="h-fit rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:p-8 lg:sticky lg:top-28">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">{first.categoryName}</p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] sm:text-5xl">{first.title}</h1>
            <p className="mt-3 text-sm text-slate-500">Sold by <span className="font-semibold text-slate-800">{first.sellerName}</span></p>

            <div className="mt-6 flex items-end gap-3">
              <span className="text-3xl font-black">{money(selectedVariant.pricePaise)}</span>
              {selectedVariant.compareAtPaise ? <span className="text-base text-slate-400 line-through">{money(selectedVariant.compareAtPaise)}</span> : null}
            </div>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Variant</p>
              <p className="mt-1 font-semibold">{selectedVariant.variantTitle}</p>
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
              <AddToCart variantId={selectedVariant.variantId} availableQuantity={availableQuantity} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
