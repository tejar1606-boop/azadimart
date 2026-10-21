import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { createDatabase } from "./client";
import { recordLowestPriceChange } from "./price-drop";
import { couponLimitOf, priceSnapshot, recordCouponLimitChange, recordPriceHistory, type PriceHistoryActors } from "./price-history";
import { inventory, mediaAssets, productMedia, productVariants, products, qcSubmissions, type ProductEditChanges } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Applies a seller's edit to a product: details, photos/video and the main
 * variant's price, MRP, SKU and weight. The URL slug is kept so links and
 * search rankings don't break. Used for direct edits (drafts) and when QC
 * approves an edit to a live product.
 */
export async function applyProductEdit(tx: Db | Tx, productId: string, sellerId: string, changes: ProductEditChanges, history?: PriceHistoryActors): Promise<void> {
  // Price/MRP changes are kept in the product's price history (who asked, who approved).
  const before = history ? await priceSnapshot(tx, productId) : null;
  const couponBefore = history ? await couponLimitOf(tx, productId) : 0;
  await writeProductEdit(tx, productId, sellerId, changes);
  if (history && before) {
    await recordPriceHistory(tx, productId, before, history);
    await recordCouponLimitChange(tx, productId, couponBefore, changes.couponMaxDiscountPct ?? couponBefore, history);
  }
}

async function writeProductEdit(tx: Db | Tx, productId: string, sellerId: string, changes: ProductEditChanges): Promise<void> {
  await tx.update(products).set({
    title: changes.title,
    categoryId: changes.categoryId,
    description: changes.description,
    specifications: changes.specifications,
    couponMaxDiscountPct: changes.couponMaxDiscountPct,
    ...(changes.gst !== undefined ? { hsnCode: changes.gst?.hsnCode ?? null, gstRateBps: changes.gst?.gstRateBps ?? null } : {}),
    updatedAt: new Date(),
  }).where(eq(products.id, productId));

  await tx.delete(productMedia).where(eq(productMedia.productId, productId));
  const colorOf = (id: string) => changes.imageColors?.[id] ?? null;
  await tx.insert(productMedia).values([
    ...changes.imageAssetIds.map((mediaAssetId, index) => ({ productId, mediaAssetId, kind: "IMAGE" as const, sortOrder: index, color: colorOf(mediaAssetId) })),
    ...(changes.videoAssetId ? [{ productId, mediaAssetId: changes.videoAssetId, kind: "VIDEO" as const, sortOrder: changes.imageAssetIds.length }] : []),
  ]);

  const existing = await tx.select({ id: productVariants.id, pricePaise: productVariants.pricePaise, isActive: productVariants.isActive }).from(productVariants)
    .where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.createdAt));
  const lowest = (prices: number[]) => (prices.length ? Math.min(...prices) : null);
  const before = lowest(existing.filter((v) => v.isActive).map((v) => v.pricePaise));

  if (changes.variants?.length) {
    // Colours/sizes: update the ones kept, add new ones, and switch off removed ones
    // (never deleted, because past orders point at them).
    const keep = new Set<string>();
    const known = new Set(existing.map((v) => v.id));
    const start = Date.now();
    for (const [i, v] of changes.variants.entries()) {
      const values = { sku: v.sku, title: v.title, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise, weightGrams: v.weightGrams, attributes: v.attributes, isActive: true, updatedAt: new Date() };
      if (v.id && known.has(v.id)) {
        keep.add(v.id);
        await tx.update(productVariants).set(values).where(and(eq(productVariants.id, v.id), eq(productVariants.productId, productId)));
      } else {
        const created = (await tx.insert(productVariants).values({ productId, ...values, createdAt: new Date(start + i) }).returning({ id: productVariants.id }))[0];
        if (created) { keep.add(created.id); await tx.insert(inventory).values({ variantId: created.id, sellerId, onHand: v.onHand ?? 0, reserved: 0 }); }
      }
    }
    const removed = existing.filter((v) => !keep.has(v.id) && v.isActive).map((v) => v.id);
    if (removed.length) await tx.update(productVariants).set({ isActive: false, updatedAt: new Date() }).where(inArray(productVariants.id, removed));
    await recordLowestPriceChange(tx, productId, before, lowest(changes.variants.map((v) => v.pricePaise)));
    return;
  }

  const variant = existing[0];
  const values = { sku: changes.variant.sku, title: changes.variant.title, pricePaise: changes.variant.pricePaise, compareAtPaise: changes.variant.compareAtPaise, weightGrams: changes.variant.weightGrams, updatedAt: new Date() };
  if (variant) {
    await tx.update(productVariants).set(values).where(eq(productVariants.id, variant.id));
    await recordLowestPriceChange(tx, productId, variant.pricePaise, changes.variant.pricePaise);
  } else {
    const created = (await tx.insert(productVariants).values({ productId, ...values, attributes: {}, isActive: true }).returning({ id: productVariants.id }))[0];
    if (created) await tx.insert(inventory).values({ variantId: created.id, sellerId, onHand: 0, reserved: 0 });
  }
}

/** Sets the main variant's stock. Stock changes never need QC. */
export async function setProductStock(tx: Db | Tx, productId: string, onHand: number): Promise<void> {
  const variant = (await tx.select({ id: productVariants.id }).from(productVariants)
    .where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.createdAt)).limit(1))[0];
  if (!variant) return;
  await tx.update(inventory).set({ onHand, updatedAt: new Date() }).where(eq(inventory.variantId, variant.id));
}

/** Sets stock for several of this product's variants at once (ids not on this product are ignored). */
export async function setVariantStocks(tx: Db | Tx, productId: string, stocks: Array<{ id: string; onHand: number }>): Promise<void> {
  if (!stocks.length) return;
  const own = new Set((await tx.select({ id: productVariants.id }).from(productVariants)
    .where(and(eq(productVariants.productId, productId), inArray(productVariants.id, stocks.map((s) => s.id))))).map((v) => v.id));
  for (const s of stocks) if (own.has(s.id)) await tx.update(inventory).set({ onHand: s.onHand, updatedAt: new Date() }).where(eq(inventory.variantId, s.id));
}

/** Everything the seller's Edit page needs: current details, media URLs and any edit waiting in QC. */
export async function loadProductForEdit(db: Db, productId: string, sellerId: string) {
  const product = (await db.select().from(products).where(and(eq(products.id, productId), eq(products.sellerId, sellerId))).limit(1))[0];
  if (!product) return null;
  const [variant, media, latestEdit, variants] = await Promise.all([
    db.select({ sku: productVariants.sku, title: productVariants.title, pricePaise: productVariants.pricePaise, compareAtPaise: productVariants.compareAtPaise, weightGrams: productVariants.weightGrams, onHand: inventory.onHand })
      .from(productVariants).leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.createdAt)).limit(1).then((r) => r[0] ?? null),
    db.select({ id: mediaAssets.id, kind: productMedia.kind, storageKey: mediaAssets.storageKey, color: productMedia.color })
      .from(productMedia).innerJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
      .where(eq(productMedia.productId, productId)).orderBy(asc(productMedia.sortOrder)),
    db.select({ id: qcSubmissions.id, status: qcSubmissions.status, notes: qcSubmissions.notes, proposedChanges: qcSubmissions.proposedChanges, updatedAt: qcSubmissions.updatedAt })
      .from(qcSubmissions).where(and(eq(qcSubmissions.productId, productId), isNotNull(qcSubmissions.proposedChanges)))
      .orderBy(desc(qcSubmissions.createdAt)).limit(1).then((r) => r[0] ?? null),
    db.select({ id: productVariants.id, sku: productVariants.sku, title: productVariants.title, pricePaise: productVariants.pricePaise, compareAtPaise: productVariants.compareAtPaise, attributes: productVariants.attributes, onHand: inventory.onHand })
      .from(productVariants).leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true))).orderBy(asc(productVariants.createdAt)),
  ]);
  const pendingEdit = latestEdit && ["PENDING", "IN_REVIEW"].includes(latestEdit.status) ? latestEdit : null;
  // Media the pending edit uses, so the form can show it.
  const pendingIds = pendingEdit?.proposedChanges ? [...pendingEdit.proposedChanges.imageAssetIds, ...(pendingEdit.proposedChanges.videoAssetId ? [pendingEdit.proposedChanges.videoAssetId] : [])] : [];
  const pendingMedia = pendingIds.length ? await db.select({ id: mediaAssets.id, kind: mediaAssets.kind, storageKey: mediaAssets.storageKey }).from(mediaAssets).where(inArray(mediaAssets.id, pendingIds)) : [];
  return {
    product: { id: product.id, title: product.title, slug: product.slug, status: product.status, categoryId: product.categoryId, description: product.description, specifications: product.specifications, couponMaxDiscountPct: product.couponMaxDiscountPct, gst: product.hsnCode && product.gstRateBps != null ? { hsnCode: product.hsnCode, gstRateBps: product.gstRateBps } : null },
    variant,
    variants,
    media: media.map((m) => ({ id: m.id, kind: m.kind, url: "/media/" + m.storageKey, color: m.color })),
    pendingEdit: pendingEdit ? { id: pendingEdit.id, changes: pendingEdit.proposedChanges, submittedAt: pendingEdit.updatedAt, media: pendingMedia.map((m) => ({ id: m.id, kind: m.kind, url: "/media/" + m.storageKey })) } : null,
    lastRejectedEdit: latestEdit && latestEdit.status === "REJECTED" ? { notes: latestEdit.notes, at: latestEdit.updatedAt } : null,
  };
}
