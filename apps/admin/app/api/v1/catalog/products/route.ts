import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, inventory, mediaAssets, productMedia, productVariants, products, sellers } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

const STATUSES = ["DRAFT", "PENDING_QC", "QC_REJECTED", "PENDING_ADMIN_APPROVAL", "LIVE", "UNLISTED", "ARCHIVED"] as const;

/** All products across sellers, with search (title, SKU, seller) and status filter. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const status = url.searchParams.get("status") ?? "";
    const db = createDatabase();
    const filters: SQL[] = [];
    if ((STATUSES as readonly string[]).includes(status)) filters.push(eq(products.status, status as (typeof STATUSES)[number]));
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
      const skuMatches = db.select({ id: productVariants.productId }).from(productVariants).where(ilike(productVariants.sku, like));
      filters.push(or(ilike(products.title, like), ilike(sellers.storeName, like), inArray(products.id, skuMatches))!);
    }
    const rows = await db.select({
      id: products.id, title: products.title, slug: products.slug, status: products.status, updatedAt: products.updatedAt,
      sellerName: sellers.storeName,
    }).from(products).innerJoin(sellers, eq(sellers.id, products.sellerId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(products.updatedAt)).limit(200);

    const ids = rows.map((row) => row.id);
    const [media, variants] = ids.length ? await Promise.all([
      db.select({ productId: productMedia.productId, key: mediaAssets.storageKey, sortOrder: productMedia.sortOrder })
        .from(productMedia).innerJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
        .where(and(inArray(productMedia.productId, ids), eq(productMedia.kind, "IMAGE"))),
      db.select({ productId: productVariants.productId, pricePaise: productVariants.pricePaise, compareAtPaise: productVariants.compareAtPaise, onHand: inventory.onHand, reserved: inventory.reserved })
        .from(productVariants).leftJoin(inventory, eq(inventory.variantId, productVariants.id)).where(inArray(productVariants.productId, ids)),
    ]) : [[], []];

    return NextResponse.json({
      items: rows.map((row) => {
        const cover = media.filter((m) => m.productId === row.id).sort((a, b) => a.sortOrder - b.sortOrder)[0];
        const vs = variants.filter((v) => v.productId === row.id);
        return {
          ...row,
          coverImageUrl: cover ? "/media/" + cover.key : null,
          pricePaise: vs.length ? Math.min(...vs.map((v) => v.pricePaise)) : null,
          available: vs.reduce((sum, v) => sum + Math.max(0, (v.onHand ?? 0) - (v.reserved ?? 0)), 0),
        };
      }),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
