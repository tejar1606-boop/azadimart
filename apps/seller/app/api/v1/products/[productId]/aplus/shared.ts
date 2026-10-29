import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, mediaAssets, products, sellers } from "@azadimart/database";
import { AppError, type AplusBlock, aplusComparedProductIds, aplusMediaUrls, uuidSchema } from "@azadimart/shared";
import { and, eq, inArray, ne } from "drizzle-orm";

/** The seller's own product (ACTIVE sellers only). */
export async function requireOwnedProduct(request: Request, productId: string) {
  const principal = await requireApiAccess(request, "seller", ["SELLER"]);
  if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
  if (!uuidSchema.safeParse(productId).success) throw new AppError("NOT_FOUND", "Product not found");
  const db = createDatabase();
  const seller = (await db.select({ status: sellers.status }).from(sellers)
    .where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
  if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");
  const product = (await db.select({ id: products.id, title: products.title, status: products.status }).from(products)
    .where(and(eq(products.id, productId), eq(products.sellerId, principal.sellerId))).limit(1))[0];
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  return { db, principal: { userId: principal.userId, sellerId: principal.sellerId }, product };
}

/**
 * Blocks may only use media this seller uploaded and compare against this
 * seller's other products: browser-supplied URLs and ids are never trusted.
 */
export async function assertBlocksOwned(db: ReturnType<typeof createDatabase>, blocks: AplusBlock[], owner: { userId: string; sellerId: string }, productId: string) {
  const keys = [...new Set(aplusMediaUrls(blocks).map((url) => url.slice("/media/".length)))];
  if (keys.some((key) => !key.startsWith(`product-media/${owner.sellerId}/`))) throw new AppError("FORBIDDEN", "A+ media must be uploaded from your account");
  if (keys.length) {
    const found = await db.select({ storageKey: mediaAssets.storageKey }).from(mediaAssets)
      .where(and(inArray(mediaAssets.storageKey, keys), eq(mediaAssets.uploadedByUserId, owner.userId)));
    if (found.length !== keys.length) throw new AppError("FORBIDDEN", "A+ media must be uploaded from your account");
  }
  const compared = aplusComparedProductIds(blocks);
  if (compared.includes(productId)) throw new AppError("VALIDATION_ERROR", "Compare with other products, not this one");
  if (compared.length) {
    const owned = await db.select({ id: products.id }).from(products)
      .where(and(inArray(products.id, compared), eq(products.sellerId, owner.sellerId), ne(products.status, "ARCHIVED")));
    if (owned.length !== compared.length) throw new AppError("FORBIDDEN", "You can only compare with your own products");
  }
}
