import { requireApiAccess, enforceRateLimit } from "@azadimart/auth";
import { categories, createDatabase, inventory, mediaAssets, productMedia, productVariants, products, qcSubmissions, sellers } from "@azadimart/database";
import { insertSellerProduct } from "./create-product";
import { AppError, productDraftSchema, toApiError } from "@azadimart/shared";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");

    const db = createDatabase();
    const seller = (await db.select({ id: sellers.id, status: sellers.status }).from(sellers).where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
    if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");
    await enforceRateLimit(db, request, "productCreate", { subject: principal.userId });

    const input = productDraftSchema.parse(await request.json());
    const category = (await db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, input.categoryId), eq(categories.isActive, true))).limit(1))[0];
    if (!category) throw new AppError("VALIDATION_ERROR", "Choose an active category");
    if (input.variants?.length && !input.variant) throw new AppError("VALIDATION_ERROR", "Enter the package weight");
    if (input.imageColors && Object.keys(input.imageColors).some((id) => !input.imageAssetIds.includes(id))) throw new AppError("VALIDATION_ERROR", "A colour was set for a photo that isn't on this product");
    const assetIds = [...input.imageAssetIds, ...(input.videoAssetId ? [input.videoAssetId] : [])];
    const assets = await db.select({ id: mediaAssets.id, kind: mediaAssets.kind, uploadedByUserId: mediaAssets.uploadedByUserId })
      .from(mediaAssets).where(and(inArray(mediaAssets.id, assetIds), eq(mediaAssets.uploadedByUserId, principal.userId)));

    if (assets.length !== assetIds.length) throw new AppError("FORBIDDEN", "One or more media assets are not owned by this seller");
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    if (input.imageAssetIds.some((id) => assetById.get(id)?.kind !== "IMAGE")) throw new AppError("VALIDATION_ERROR", "All imageAssetIds must reference image media");
    if (input.videoAssetId && assetById.get(input.videoAssetId)?.kind !== "VIDEO") throw new AppError("VALIDATION_ERROR", "videoAssetId must reference video media");

    const skus = input.variants?.length ? input.variants.map((v) => v.sku) : input.variant ? [input.variant.sku] : [];
    const taken = skus.length ? await db.select({ sku: productVariants.sku }).from(productVariants).where(inArray(productVariants.sku, skus)).limit(5) : [];
    if (taken.length) throw new AppError("CONFLICT", `SKU ${taken.map((t) => t.sku).join(", ")} is already used on LOIMART. Use a different SKU.`);

    const inserted = await db.transaction((tx) => insertSellerProduct(tx, principal.sellerId!, input));

    return NextResponse.json({ product: inserted }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const db = createDatabase();
    const seller = (await db.select({ id: sellers.id, status: sellers.status }).from(sellers).where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
    if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");

    const rows = await db.select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      description: products.description,
      status: products.status,
      couponMaxDiscountPct: products.couponMaxDiscountPct,
      categoryId: products.categoryId,
      brandId: products.brandId,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    }).from(products).where(eq(products.sellerId, principal.sellerId)).orderBy(desc(products.createdAt));

    // Cover image (first image by sort order), cheapest variant and stock for the list view.
    const productIds = rows.map((row) => row.id);
    const [mediaRows, variantRows, editRows] = productIds.length ? await Promise.all([
      db.select({ productId: productMedia.productId, storageKey: mediaAssets.storageKey, sortOrder: productMedia.sortOrder })
        .from(productMedia).innerJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
        .where(and(inArray(productMedia.productId, productIds), eq(productMedia.kind, "IMAGE"))),
      db.select({ productId: productVariants.productId, pricePaise: productVariants.pricePaise, onHand: inventory.onHand, reserved: inventory.reserved })
        .from(productVariants).leftJoin(inventory, eq(inventory.variantId, productVariants.id))
        .where(inArray(productVariants.productId, productIds)),
      // Edits to live products still waiting in QC.
      db.select({ productId: qcSubmissions.productId }).from(qcSubmissions)
        .where(and(inArray(qcSubmissions.productId, productIds), isNotNull(qcSubmissions.proposedChanges), inArray(qcSubmissions.status, ["PENDING", "IN_REVIEW"]))),
    ]) : [[], [], []];
    const pendingEdit = new Set(editRows.map((row) => row.productId));
    const cover = new Map<string, { key: string; order: number }>();
    for (const media of mediaRows) {
      const current = cover.get(media.productId);
      if (!current || media.sortOrder < current.order) cover.set(media.productId, { key: media.storageKey, order: media.sortOrder });
    }

    return NextResponse.json({
      products: rows.map((row) => {
        const variants = variantRows.filter((variant) => variant.productId === row.id);
        return {
          ...row,
          coverImageUrl: cover.has(row.id) ? "/media/" + cover.get(row.id)!.key : null,
          pricePaise: variants.length ? Math.min(...variants.map((variant) => variant.pricePaise)) : null,
          available: variants.reduce((sum, variant) => sum + Math.max(0, (variant.onHand ?? 0) - (variant.reserved ?? 0)), 0),
          hasPendingEdit: pendingEdit.has(row.id),
        };
      }),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
