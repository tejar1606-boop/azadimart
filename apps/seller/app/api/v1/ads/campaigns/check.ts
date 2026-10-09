import { mediaAssets, products, type Database } from "@azadimart/database";
import { AppError } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";

/** The product must be the seller's own live product, and the banners images they uploaded. */
export async function checkAdContent(db: Database, sellerId: string, userId: string, input: { productId: string; desktopImageAssetId: string; mobileImageAssetId: string | null }) {
  const product = (await db.select({ status: products.status }).from(products).where(and(eq(products.id, input.productId), eq(products.sellerId, sellerId))).limit(1))[0];
  if (!product) throw new AppError("VALIDATION_ERROR", "Choose one of your products");
  if (product.status !== "LIVE") throw new AppError("VALIDATION_ERROR", "Only live products can be advertised");
  const ids = [input.desktopImageAssetId, ...(input.mobileImageAssetId ? [input.mobileImageAssetId] : [])];
  const assets = await db.select({ id: mediaAssets.id, kind: mediaAssets.kind }).from(mediaAssets).where(and(inArray(mediaAssets.id, ids), eq(mediaAssets.uploadedByUserId, userId)));
  if (assets.length !== ids.length || assets.some((a) => a.kind !== "IMAGE")) throw new AppError("VALIDATION_ERROR", "Upload your banner images again");
}
