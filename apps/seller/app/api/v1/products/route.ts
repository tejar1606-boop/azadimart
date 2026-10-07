import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, inventory, mediaAssets, productMedia, productVariants, products, sellers } from "@azadimart/database";
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

    const input = productDraftSchema.parse(await request.json());
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
        description: input.description ?? null,
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

    return NextResponse.json({ products: rows });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
