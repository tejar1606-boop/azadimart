import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./client";
import { mediaAssets, productMedia, productVariants, products } from "./schema/index";

export type ProductSummary = { id: string; title: string; slug: string; status: string; sellerId: string; imageUrl: string | null; pricePaise: number | null };

type Reader = Pick<Database, "select">;

/** Title, cover image and lowest active price for a set of products (e.g. A+ comparison tables). */
export async function productSummaries(db: Reader, ids: string[]): Promise<Record<string, ProductSummary>> {
  if (!ids.length) return {};
  const [rows, media, variants] = await Promise.all([
    db.select({ id: products.id, title: products.title, slug: products.slug, status: products.status, sellerId: products.sellerId }).from(products).where(inArray(products.id, ids)),
    db.select({ productId: productMedia.productId, storageKey: mediaAssets.storageKey, sortOrder: productMedia.sortOrder })
      .from(productMedia).innerJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
      .where(and(inArray(productMedia.productId, ids), eq(productMedia.kind, "IMAGE"))),
    db.select({ productId: productVariants.productId, pricePaise: productVariants.pricePaise })
      .from(productVariants).where(and(inArray(productVariants.productId, ids), eq(productVariants.isActive, true))),
  ]);
  const result: Record<string, ProductSummary> = {};
  for (const row of rows) {
    const cover = media.filter((item) => item.productId === row.id).sort((a, b) => a.sortOrder - b.sortOrder)[0];
    const prices = variants.filter((variant) => variant.productId === row.id).map((variant) => variant.pricePaise);
    result[row.id] = { ...row, imageUrl: cover ? "/media/" + cover.storageKey : null, pricePaise: prices.length ? Math.min(...prices) : null };
  }
  return result;
}
