import { requireApiAccess } from "@azadimart/auth";
import {
  auditLogs, cartItems, categories, createDatabase, inventory, inventoryMovements, mediaAssets, orderItems,
  productMedia, productVariants, products, sellers,
} from "@azadimart/database";
import { AppError, adminProductUpdateSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ productId: string }> };

async function admin(request: Request, params: Params["params"]) {
  const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
  const { productId } = await params;
  if (!uuidSchema.safeParse(productId).success) throw new AppError("NOT_FOUND", "Product not found");
  return { principal, productId, db: createDatabase() };
}

/** Everything the admin editor needs for one product. */
export async function GET(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const { db, productId } = await admin(request, params);
    const product = (await db.select({
      id: products.id, title: products.title, slug: products.slug, description: products.description, status: products.status,
      categoryId: products.categoryId, sellerId: products.sellerId, sellerName: sellers.storeName, updatedAt: products.updatedAt,
    }).from(products).innerJoin(sellers, eq(sellers.id, products.sellerId)).where(eq(products.id, productId)).limit(1))[0];
    if (!product) throw new AppError("NOT_FOUND", "Product not found");
    const [variants, media, categoryRows, ordered] = await Promise.all([
      db.select({
        id: productVariants.id, title: productVariants.title, sku: productVariants.sku, pricePaise: productVariants.pricePaise,
        compareAtPaise: productVariants.compareAtPaise, weightGrams: productVariants.weightGrams, isActive: productVariants.isActive,
        onHand: inventory.onHand, reserved: inventory.reserved,
      }).from(productVariants).leftJoin(inventory, eq(inventory.variantId, productVariants.id)).where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.createdAt)),
      db.select({ mediaAssetId: productMedia.mediaAssetId, kind: productMedia.kind, sortOrder: productMedia.sortOrder, key: mediaAssets.storageKey })
        .from(productMedia).innerJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId)).where(eq(productMedia.productId, productId)).orderBy(asc(productMedia.sortOrder)),
      db.select({ id: categories.id, name: categories.name, isActive: categories.isActive }).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
      db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, productId)).limit(1),
    ]);
    return NextResponse.json({
      product,
      variants: variants.map((v) => ({ ...v, onHand: v.onHand ?? 0, reserved: v.reserved ?? 0 })),
      media: media.map((m) => ({ mediaAssetId: m.mediaAssetId, kind: m.kind, url: "/media/" + m.key })),
      categories: categoryRows,
      hasOrders: ordered.length > 0,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Manual admin edit of details, variants (price, MRP, stock, weight) and media, in one transaction. */
export async function PATCH(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const { db, productId, principal } = await admin(request, params);
    const input = adminProductUpdateSchema.parse(await request.json());
    const result = await db.transaction(async (tx) => {
      const product = (await tx.select({ id: products.id, sellerId: products.sellerId, status: products.status }).from(products)
        .where(eq(products.id, productId)).limit(1).for("update"))[0];
      if (!product) throw new AppError("NOT_FOUND", "Product not found");
      const category = (await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.isActive, true))).limit(1))[0];
      if (!category) throw new AppError("VALIDATION_ERROR", "Choose an active category");

      // Media must be existing images/videos; product media is public, documents are never allowed.
      const mediaIds = [...input.imageAssetIds, ...(input.videoAssetId ? [input.videoAssetId] : [])];
      const assets = await tx.select({ id: mediaAssets.id, kind: mediaAssets.kind }).from(mediaAssets).where(inArray(mediaAssets.id, mediaIds));
      const kinds = new Map(assets.map((a) => [a.id, a.kind]));
      if (input.imageAssetIds.some((id) => kinds.get(id) !== "IMAGE")) throw new AppError("VALIDATION_ERROR", "Every image must be an uploaded image");
      if (input.videoAssetId && kinds.get(input.videoAssetId) !== "VIDEO") throw new AppError("VALIDATION_ERROR", "The video must be an uploaded video");

      await tx.update(products).set({ title: input.title, description: input.description || null, categoryId: input.categoryId, updatedAt: new Date() }).where(eq(products.id, productId));

      const existing = await tx.select({ id: productVariants.id, pricePaise: productVariants.pricePaise, compareAtPaise: productVariants.compareAtPaise }).from(productVariants).where(eq(productVariants.productId, productId));
      const owned = new Map(existing.map((v) => [v.id, v]));
      const changes: Array<Record<string, unknown>> = [];
      const priceChanges: Array<Record<string, unknown>> = [];
      for (const variant of input.variants) {
        const before = owned.get(variant.id);
        if (!before) throw new AppError("VALIDATION_ERROR", "Unknown variant");
        if (before.pricePaise !== variant.pricePaise || before.compareAtPaise !== (variant.compareAtPaise ?? null)) {
          priceChanges.push({ sku: variant.sku, pricePaise: [before.pricePaise, variant.pricePaise], compareAtPaise: [before.compareAtPaise, variant.compareAtPaise ?? null] });
        }
        await tx.update(productVariants).set({
          title: variant.title, sku: variant.sku, pricePaise: variant.pricePaise, compareAtPaise: variant.compareAtPaise ?? null,
          weightGrams: variant.weightGrams, isActive: variant.isActive, updatedAt: new Date(),
        }).where(eq(productVariants.id, variant.id));
        const stock = (await tx.select({ id: inventory.id, onHand: inventory.onHand, reserved: inventory.reserved }).from(inventory).where(eq(inventory.variantId, variant.id)).limit(1).for("update"))[0];
        if (!stock) {
          await tx.insert(inventory).values({ variantId: variant.id, sellerId: product.sellerId, onHand: variant.onHand, reserved: 0 });
          if (variant.onHand) await tx.insert(inventoryMovements).values({ variantId: variant.id, movementType: "ADJUSTMENT", quantity: variant.onHand, referenceType: "ADMIN_EDIT", referenceId: productId, notes: "Stock set by admin", createdByUserId: principal.userId });
        } else if (stock.onHand !== variant.onHand) {
          if (variant.onHand < stock.reserved) throw new AppError("CONFLICT", `${variant.sku}: stock can't go below ${stock.reserved} units reserved for open orders`);
          await tx.update(inventory).set({ onHand: variant.onHand, updatedAt: new Date() }).where(eq(inventory.id, stock.id));
          await tx.insert(inventoryMovements).values({ variantId: variant.id, movementType: "ADJUSTMENT", quantity: variant.onHand - stock.onHand, referenceType: "ADMIN_EDIT", referenceId: productId, notes: "Stock adjusted by admin", createdByUserId: principal.userId });
          changes.push({ sku: variant.sku, onHand: [stock.onHand, variant.onHand] });
        }
      }

      await tx.delete(productMedia).where(eq(productMedia.productId, productId));
      await tx.insert(productMedia).values([
        ...input.imageAssetIds.map((mediaAssetId, index) => ({ productId, mediaAssetId, kind: "IMAGE" as const, sortOrder: index })),
        ...(input.videoAssetId ? [{ productId, mediaAssetId: input.videoAssetId, kind: "VIDEO" as const, sortOrder: input.imageAssetIds.length }] : []),
      ]);

      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: "PRODUCT_EDITED_BY_ADMIN",
        entityType: "product",
        entityId: productId,
        metadata: { title: input.title, variants: input.variants.length, images: input.imageAssetIds.length, video: Boolean(input.videoAssetId), priceChanges, stockChanges: changes },
      });
      return { id: productId };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/**
 * Permanent delete — only for products that were never ordered (orders keep
 * product references). Ordered products can only be archived.
 */
export async function DELETE(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const { db, productId, principal } = await admin(request, params);
    await db.transaction(async (tx) => {
      const product = (await tx.select({ id: products.id, title: products.title, sellerId: products.sellerId }).from(products).where(eq(products.id, productId)).limit(1).for("update"))[0];
      if (!product) throw new AppError("NOT_FOUND", "Product not found");
      const ordered = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, productId)).limit(1);
      if (ordered.length) throw new AppError("CONFLICT", "This product has orders, so it can only be archived (hidden everywhere) to keep order records.");
      const variantIds = (await tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId))).map((v) => v.id);
      if (variantIds.length) {
        await tx.delete(cartItems).where(inArray(cartItems.variantId, variantIds));
        await tx.delete(inventoryMovements).where(inArray(inventoryMovements.variantId, variantIds));
      }
      await tx.delete(products).where(eq(products.id, productId));
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "PRODUCT_DELETED_BY_ADMIN", entityType: "product", entityId: productId, metadata: { title: product.title, sellerId: product.sellerId } });
    });
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
