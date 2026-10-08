import { createDatabase, inventory, productMedia, productVariants, products, categories, mediaAssets, sellers } from "@azadimart/database";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function toPositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const categoryId = searchParams.get("categoryId");
    const sort = searchParams.get("sort") ?? "featured";
    const minPrice = Number(searchParams.get("minPrice"));
    const maxPrice = Number(searchParams.get("maxPrice"));
    const limit = toPositiveInt(searchParams.get("limit"), 24, 60);

    const db = createDatabase();
    const filters = [eq(products.status, "LIVE"), eq(productVariants.isActive, true)];
    // A main category also shows its sub-categories' products.
    if (categoryId && UUID.test(categoryId)) {
      filters.push(or(eq(products.categoryId, categoryId), inArray(products.categoryId, db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, categoryId))))!);
    }
    if (query) filters.push(or(ilike(products.title, "%" + query + "%"), ilike(products.description, "%" + query + "%"))!);
    if (Number.isFinite(minPrice) && minPrice >= 0) filters.push(gte(productVariants.pricePaise, minPrice));
    if (Number.isFinite(maxPrice) && maxPrice > 0) filters.push(lte(productVariants.pricePaise, maxPrice));

    const rows = await db.select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      description: products.description,
      categoryId: products.categoryId,
      categoryName: categories.name,
      sellerId: sellers.id,
      sellerName: sellers.storeName,
      variantId: productVariants.id,
      variantTitle: productVariants.title,
      sku: productVariants.sku,
      pricePaise: productVariants.pricePaise,
      compareAtPaise: productVariants.compareAtPaise,
      availableQuantity: inventory.onHand,
      reservedQuantity: inventory.reserved,
      mediaAssetId: productMedia.mediaAssetId,
      mediaKind: productMedia.kind,
      mediaStorageKey: mediaAssets.storageKey,
      mediaAltText: mediaAssets.altText,
      reviewCount: products.reviewCount,
      ratingTotal: products.ratingTotal,
    })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(sellers, eq(sellers.id, products.sellerId))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .leftJoin(productMedia, eq(productMedia.productId, products.id))
      .leftJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
      .where(and(...filters))
      .orderBy(
        sort === "price_asc"
          ? asc(productVariants.pricePaise)
          : sort === "price_desc"
            ? desc(productVariants.pricePaise)
            : sort === "newest"
              ? desc(products.createdAt)
              // "featured": the order admins set on the Arrange products page, then newest first.
              : asc(products.position),
        desc(products.createdAt),
        asc(productMedia.sortOrder),
      );

    const productMap = new Map<string, {
      id: string;
      title: string;
      slug: string;
      description: string | null;
      categoryId: string;
      categoryName: string;
      sellerId: string;
      sellerName: string;
      reviewCount: number;
      ratingTotal: number;
      variants: Array<{ id: string; title: string; sku: string; pricePaise: number; compareAtPaise: number | null; availableQuantity: number }>;
      media: Array<{ assetId: string; kind: string; altText: string | null; storageKey: string }>;
    }>();

    for (const row of rows) {
      const current = productMap.get(row.id) ?? {
        id: row.id,
        title: row.title,
        slug: row.slug,
        description: row.description,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        sellerId: row.sellerId,
        sellerName: row.sellerName,
        reviewCount: row.reviewCount,
        ratingTotal: row.ratingTotal,
        variants: [],
        media: [],
      };

      if (!current.variants.some((variant) => variant.id === row.variantId)) {
        current.variants.push({
          id: row.variantId,
          title: row.variantTitle,
          sku: row.sku,
          pricePaise: row.pricePaise,
          compareAtPaise: row.compareAtPaise,
          availableQuantity: Math.max(0, (row.availableQuantity ?? 0) - (row.reservedQuantity ?? 0)),
        });
      }
      if (row.mediaAssetId && !current.media.some((media) => media.assetId === row.mediaAssetId)) {
        current.media.push({
          assetId: row.mediaAssetId,
          kind: row.mediaKind ?? "IMAGE",
          altText: row.mediaAltText,
          storageKey: row.mediaStorageKey ?? "",
        });
      }
      productMap.set(row.id, current);
    }

    const items = [...productMap.values()].filter((product) => product.variants.length > 0).slice(0, limit);
    const categoryRows = await db
      .select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    return NextResponse.json({
      categories: categoryRows,
      items,
      nextCursor: null,
      requestId,
    });
  } catch {
    return NextResponse.json({ items: [], nextCursor: null, requestId, error: "Unable to load the catalog." }, { status: 500 });
  }
}
