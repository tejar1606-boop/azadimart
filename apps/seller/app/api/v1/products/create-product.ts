import { inventory, productMedia, productVariants, products, qcSubmissions, type createDatabase } from "@azadimart/database";
import { AppError, variantAttributes, variantTitleOf, type ProductDraftInput } from "@azadimart/shared";

type Tx = Parameters<Parameters<ReturnType<typeof createDatabase>["transaction"]>[0]>[0];
type ProductDraft = ProductDraftInput;

export function slugify(value: string): string {
  const base = value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return `${base || "product"}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Inserts a checked product draft (category and media already verified) with
 * its photos, variant and stock. With submitForQc it goes straight into the QC
 * queue, as if the seller pressed "Send to QC".
 */
export async function insertSellerProduct(tx: Tx, sellerId: string, input: ProductDraft, options: { submitForQc?: boolean } = {}) {
  const product = (await tx.insert(products).values({
    sellerId,
    categoryId: input.categoryId,
    title: input.title,
    slug: slugify(input.title),
    description: input.description || null,
    specifications: input.specifications ?? [],
    couponMaxDiscountPct: input.couponMaxDiscountPct,
    status: options.submitForQc ? "PENDING_QC" : "DRAFT",
  }).returning({ id: products.id, title: products.title, slug: products.slug, status: products.status }))[0];

  if (!product) throw new AppError("INTERNAL", "Product creation failed", undefined, false);

  await tx.insert(productMedia).values([
    ...input.imageAssetIds.map((mediaAssetId, index) => ({ productId: product.id, mediaAssetId, kind: "IMAGE" as const, sortOrder: index, color: input.imageColors?.[mediaAssetId] ?? null })),
    ...(input.videoAssetId ? [{ productId: product.id, mediaAssetId: input.videoAssetId, kind: "VIDEO" as const, sortOrder: input.imageAssetIds.length }] : []),
  ]);

  if (input.variants?.length) {
    // Colours/sizes: one variant (with its own SKU, price and stock) per combination.
    const weightGrams = input.variant?.weightGrams ?? 0;
    const start = Date.now();
    for (const [i, v] of input.variants.entries()) {
      const variant = (await tx.insert(productVariants).values({
        createdAt: new Date(start + i), // keeps the seller's colour/size order (one transaction = one clock time otherwise)
        productId: product.id, sku: v.sku, title: variantTitleOf(v), pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise ?? null,
        weightGrams, attributes: variantAttributes(v), isActive: true,
      }).returning({ id: productVariants.id }))[0];
      if (!variant) throw new AppError("INTERNAL", "Product variant creation failed", undefined, false);
      await tx.insert(inventory).values({ variantId: variant.id, sellerId, onHand: v.onHand, reserved: 0 });
    }
  } else if (input.variant) {
    const variant = (await tx.insert(productVariants).values({
      productId: product.id,
      sku: input.variant.sku,
      title: input.variant.title,
      pricePaise: input.variant.pricePaise,
      compareAtPaise: input.variant.compareAtPaise ?? null,
      weightGrams: input.variant.weightGrams,
      attributes: {},
      isActive: true,
    }).returning({ id: productVariants.id }))[0];
    if (!variant) throw new AppError("INTERNAL", "Product variant creation failed", undefined, false);
    await tx.insert(inventory).values({
      variantId: variant.id,
      sellerId,
      onHand: input.variant.onHand,
      reserved: 0,
    });
  }

  if (options.submitForQc) await tx.insert(qcSubmissions).values({ productId: product.id, sellerId, status: "PENDING", notes: null });

  return product;
}
