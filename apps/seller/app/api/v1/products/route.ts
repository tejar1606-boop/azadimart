import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, mediaAssets, productMedia, products } from "@azadimart/database";
import { productDraftSchema, toApiError } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

function slugify(value: string): string {
  const base = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return `${base || "product"}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) {
      throw new Error("Authenticated seller profile is missing");
    }

    const input = productDraftSchema.parse(await request.json());
    const db = createDatabase();

    const assetIds = [...input.imageAssetIds, ...(input.videoAssetId ? [input.videoAssetId] : [])];
    const assets = await db
      .select({
        id: mediaAssets.id,
        kind: mediaAssets.kind,
        uploadedByUserId: mediaAssets.uploadedByUserId,
      })
      .from(mediaAssets)
      .where(
        and(
          inArray(mediaAssets.id, assetIds),
          eq(mediaAssets.uploadedByUserId, principal.userId),
        ),
      );

    if (assets.length !== assetIds.length) {
      throw new Error("One or more media assets are not owned by this seller");
    }

    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    if (input.imageAssetIds.some((id) => assetById.get(id)?.kind !== "IMAGE")) {
      throw new Error("All imageAssetIds must reference image media");
    }
    if (input.videoAssetId && assetById.get(input.videoAssetId)?.kind !== "VIDEO") {
      throw new Error("videoAssetId must reference video media");
    }

    const inserted = await db
      .insert(products)
      .values({
        sellerId: principal.sellerId,
        categoryId: input.categoryId,
        title: input.title,
        slug: slugify(input.title),
        description: input.description ?? null,
        status: "DRAFT",
      })
      .returning({
        id: products.id,
        title: products.title,
        slug: products.slug,
        status: products.status,
      });

    const product = inserted[0];
    if (!product) {
      throw new Error("Product creation failed");
    }

    try {
      const mediaRows = [
        ...input.imageAssetIds.map((mediaAssetId, index) => ({
          productId: product.id,
          mediaAssetId,
          kind: "IMAGE" as const,
          sortOrder: index,
        })),
        ...(input.videoAssetId
          ? [{
              productId: product.id,
              mediaAssetId: input.videoAssetId,
              kind: "VIDEO" as const,
              sortOrder: input.imageAssetIds.length,
            }]
          : []),
      ];

      await db.insert(productMedia).values(mediaRows);
    } catch (mediaError) {
      await db.delete(productMedia).where(eq(productMedia.productId, product.id));
      await db.delete(products).where(eq(products.id, product.id));
      throw mediaError;
    }

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) {
      throw new Error("Authenticated seller profile is missing");
    }

    const db = createDatabase();
    const rows = await db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        description: products.description,
        status: products.status,
        categoryId: products.categoryId,
        brandId: products.brandId,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(eq(products.sellerId, principal.sellerId));

    return NextResponse.json({ products: rows });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
