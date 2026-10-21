import { requireStaff } from "@azadimart/auth";
import { createDatabase, createImportedReview, customers, mediaAssets, productReviewMedia, productReviews, products, sellers, users } from "@azadimart/database";
import { AppError, importedReviewSchema, toApiError } from "@azadimart/shared";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";

/**
 * All reviews for moderation: filter by status (Live / Hidden / Waiting for
 * approval), source and star rating; search product, seller, customer,
 * imported author or text. Waiting imports are listed first.
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "catalog");
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const source = url.searchParams.get("source");
    const rating = Number(url.searchParams.get("rating"));
    const q = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const filters: SQL[] = [];
    if (status === "PUBLISHED" || status === "HIDDEN" || status === "PENDING") filters.push(eq(productReviews.status, status));
    if (source === "VERIFIED_PURCHASE" || source === "IMPORTED") filters.push(eq(productReviews.source, source));
    if (rating >= 1 && rating <= 5) filters.push(eq(productReviews.rating, rating));
    const addedBy = alias(users, "added_by");
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
      filters.push(or(ilike(products.title, like), ilike(sellers.storeName, like), ilike(customers.fullName, like), ilike(users.email, like), ilike(productReviews.importedAuthorName, like), ilike(productReviews.title, like), ilike(productReviews.body, like))!);
    }
    const db = createDatabase();
    const rows = await db.select({
      id: productReviews.id, rating: productReviews.rating, title: productReviews.title, body: productReviews.body,
      status: productReviews.status, hiddenReason: productReviews.hiddenReason, sellerReply: productReviews.sellerReply,
      createdAt: productReviews.createdAt, productTitle: products.title, productSlug: products.slug,
      sellerName: sellers.storeName, customerName: customers.fullName, customerEmail: users.email,
      source: productReviews.source, importedAuthorName: productReviews.importedAuthorName, importedSourceName: productReviews.importedSourceName,
      importedReviewedAt: productReviews.importedReviewedAt, hasProof: sql<boolean>`${productReviews.importProofAssetId} is not null`,
      pinnedAt: productReviews.pinnedAt, addedByEmail: addedBy.email, addedByRole: addedBy.role,
    }).from(productReviews)
      .innerJoin(products, eq(products.id, productReviews.productId))
      .innerJoin(sellers, eq(sellers.id, products.sellerId))
      .leftJoin(customers, eq(customers.id, productReviews.customerId))
      .leftJoin(users, eq(users.id, customers.userId))
      .leftJoin(addedBy, eq(addedBy.id, productReviews.addedByUserId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(sql`(${productReviews.status} = 'PENDING') desc`, desc(productReviews.createdAt)).limit(200);
    const media = rows.length ? await db.select({ reviewId: productReviewMedia.reviewId, key: mediaAssets.storageKey }).from(productReviewMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, productReviewMedia.mediaAssetId)).where(inArray(productReviewMedia.reviewId, rows.map((r) => r.id))).orderBy(asc(productReviewMedia.sortOrder)) : [];
    const [pending] = await db.select({ n: sql<number>`count(*)::int` }).from(productReviews).where(eq(productReviews.status, "PENDING"));
    return NextResponse.json({ pendingCount: pending?.n ?? 0, items: rows.map((r) => ({ ...r, photos: media.filter((m) => m.reviewId === r.id).map((m) => "/media/" + m.key) })) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Admin adds a genuine review the product earned elsewhere (with a screenshot); it goes live at once, labelled with its source. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "catalog");
    const input = importedReviewSchema.parse(await request.json());
    const db = createDatabase();
    const product = (await db.select({ id: products.id }).from(products).where(eq(products.id, input.productId)).limit(1))[0];
    if (!product) throw new AppError("NOT_FOUND", "Product not found");
    const id = await createImportedReview(db, { ...input, addedByUserId: principal.userId, status: "PUBLISHED" });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
