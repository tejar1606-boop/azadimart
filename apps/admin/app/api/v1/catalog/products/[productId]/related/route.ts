import { requireStaff } from "@azadimart/auth";
import { auditLogs, createDatabase, mediaAssets, productMedia, productVariants, products, sellers } from "@azadimart/database";
import { AppError, MAX_RELATED_PRODUCTS as MAX_RELATED, productRelatedSchema as schema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ productId: string }> };

async function chosen(db: ReturnType<typeof createDatabase>, ids: string[]) {
  if (!ids.length) return [];
  const [rows, media, prices] = await Promise.all([
    db.select({ id: products.id, title: products.title, status: products.status, storeName: sellers.storeName }).from(products).innerJoin(sellers, eq(sellers.id, products.sellerId)).where(inArray(products.id, ids)),
    db.select({ productId: productMedia.productId, key: mediaAssets.storageKey, sortOrder: productMedia.sortOrder }).from(productMedia).innerJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId)).where(and(inArray(productMedia.productId, ids), eq(productMedia.kind, "IMAGE"))),
    db.select({ productId: productVariants.productId, pricePaise: productVariants.pricePaise }).from(productVariants).where(inArray(productVariants.productId, ids)),
  ]);
  // Keep the chosen order; skip products that no longer exist.
  return ids.flatMap((id) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return [];
    const cover = media.filter((m) => m.productId === id).sort((a, b) => a.sortOrder - b.sortOrder)[0];
    const ps = prices.filter((p) => p.productId === id).map((p) => p.pricePaise);
    return [{ ...row, coverImageUrl: cover ? "/media/" + cover.key : null, pricePaise: ps.length ? Math.min(...ps) : null }];
  });
}

/** The products chosen for this product's "More to explore". */
export async function GET(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    await requireStaff(request, "catalog", db);
    const productId = uuidSchema.parse((await params).productId);
    const product = (await db.select({ ids: products.relatedProductIds }).from(products).where(eq(products.id, productId)).limit(1))[0];
    if (!product) throw new AppError("NOT_FOUND", "Product not found");
    return NextResponse.json({ items: await chosen(db, product.ids), max: MAX_RELATED });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Saves the chosen products, in order. */
export async function PUT(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    const principal = await requireStaff(request, "catalog", db);
    const productId = uuidSchema.parse((await params).productId);
    const ids = [...new Set(schema.parse(await request.json()).productIds)].filter((id) => id !== productId);
    if (!(await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1))[0]) throw new AppError("NOT_FOUND", "Product not found");
    const found = ids.length ? await db.select({ id: products.id }).from(products).where(inArray(products.id, ids)) : [];
    if (found.length !== ids.length) throw new AppError("VALIDATION_ERROR", "One of the chosen products no longer exists");
    await db.update(products).set({ relatedProductIds: ids }).where(eq(products.id, productId));
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "PRODUCT_RELATED_SET", entityType: "product", entityId: productId, metadata: { productIds: ids } });
    return NextResponse.json({ items: await chosen(db, ids), max: MAX_RELATED });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
