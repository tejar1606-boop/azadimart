import { requireApiAccess, enforceRateLimit } from "@azadimart/auth";
import { categories, createDatabase, inventory, mediaAssets, productMedia, productVariants, products, sellers } from "@azadimart/database";
import { AppError, productDraftSchema, toApiError } from "@azadimart/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

function slugify(value: string): string {
  const base = value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return `${base || "product"}-${crypto.randomUUID().slice(0, 8)}`;
}

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
    const assetIds = [...input.imageAssetIds, ...(input.videoAssetId ? [input.videoAssetId] : [])];
    const assets = await db.select({ id: mediaAssets.id, kind: mediaAssets.kind, uploadedByUserId: mediaAssets.uploadedByUserId })
      .from(mediaAssets).where(and(inArray(mediaAssets.id, assetIds), eq(mediaAssets.uploadedByUserId, principal.userId)));

    if (assets.length !== assetIds.length) throw new AppError("FORBIDDEN", "One or more media assets are not owned by this seller");
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    if (input.imageAssetIds.some((id) => assetById.get(id)?.kind !== "IMAGE")) throw new AppError("VALIDATION_ERROR", "All imageAssetIds must reference image media");
    if (input.videoAssetId && assetById.get(input.videoAssetId)?.kind !== "VIDEO") throw new AppError("VALIDATION_ERROR", "videoAssetId must reference video media");

    const inserted = await db.transaction(async (tx) => {
      const product = (await tx.insert(products).values({
        sellerId: principal.sellerId!,
        categoryId: input.categoryId,
        title: input.title,
        slug: slugify(input.title),
        description: input.description || null,
        specifications: input.specifications ?? [],
        status: "DRAFT",
      }).returning({ id: products.id, title: products.title, slug: products.slug, status: products.status }))[0];

      if (!product) throw new AppError("INTERNAL", "Product creation failed", undefined, false);

      await tx.insert(productMedia).values([
        ...input.imageAssetIds.map((mediaAssetId, index) => ({ productId: product.id, mediaAssetId, kind: "IMAGE" as const, sortOrder: index })),
        ...(input.videoAssetId ? [{ productId: product.id, mediaAssetId: input.videoAssetId, kind: "VIDEO" as const, sortOrder: input.imageAssetIds.length }] : []),
      ]);

      if (input.variant) {
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
          sellerId: principal.sellerId!,
          onHand: input.variant.onHand,
          reserved: 0,
        });
      }

      return product;
    });

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
      categoryId: products.categoryId,
      brandId: products.brandId,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    }).from(products).where(eq(products.sellerId, principal.sellerId)).orderBy(desc(products.createdAt));

    // Cover image (first image by sort order), cheapest variant and stock for the list view.
    const productIds = rows.map((row) => row.id);
    const [mediaRows, variantRows] = productIds.length ? await Promise.all([
      db.select({ productId: productMedia.productId, storageKey: mediaAssets.storageKey, sortOrder: productMedia.sortOrder })
        .from(productMedia).innerJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
        .where(and(inArray(productMedia.productId, productIds), eq(productMedia.kind, "IMAGE"))),
      db.select({ productId: productVariants.productId, pricePaise: productVariants.pricePaise, onHand: inventory.onHand, reserved: inventory.reserved })
        .from(productVariants).leftJoin(inventory, eq(inventory.variantId, productVariants.id))
        .where(inArray(productVariants.productId, productIds)),
    ]) : [[], []];
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
        };
      }),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
