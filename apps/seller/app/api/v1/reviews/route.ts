import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { createDatabase, createImportedReview, customers, mediaAssets, productReviewMedia, productReviews, products } from "@azadimart/database";
import { AppError, importedReviewSchema, toApiError } from "@azadimart/shared";
import { and, asc, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Live reviews of this seller's products, plus their imported reviews in any state (waiting / rejected), newest first; optionally one star level. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const url = new URL(request.url);
    const rating = Number(url.searchParams.get("rating"));
    const filters: SQL[] = [eq(products.sellerId, principal.sellerId), or(eq(productReviews.status, "PUBLISHED"), eq(productReviews.source, "IMPORTED"))!];
    if (rating >= 1 && rating <= 5) filters.push(eq(productReviews.rating, rating));
    const db = createDatabase();
    const rows = await db.select({
      id: productReviews.id, rating: productReviews.rating, title: productReviews.title, body: productReviews.body,
      createdAt: productReviews.createdAt, sellerReply: productReviews.sellerReply, sellerRepliedAt: productReviews.sellerRepliedAt,
      productTitle: products.title, productSlug: products.slug, customerName: customers.fullName,
      status: productReviews.status, hiddenReason: productReviews.hiddenReason, source: productReviews.source,
      importedAuthorName: productReviews.importedAuthorName, importedSourceName: productReviews.importedSourceName, importedReviewedAt: productReviews.importedReviewedAt,
    }).from(productReviews).innerJoin(products, eq(products.id, productReviews.productId)).leftJoin(customers, eq(customers.id, productReviews.customerId))
      .where(and(...filters)).orderBy(desc(productReviews.createdAt)).limit(200);
    const media = rows.length ? await db.select({ reviewId: productReviewMedia.reviewId, key: mediaAssets.storageKey }).from(productReviewMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, productReviewMedia.mediaAssetId)).where(inArray(productReviewMedia.reviewId, rows.map((r) => r.id))).orderBy(asc(productReviewMedia.sortOrder)) : [];
    const totals = (await db.select({ reviewCount: products.reviewCount, ratingTotal: products.ratingTotal }).from(products).where(eq(products.sellerId, principal.sellerId)))
      .reduce((acc, p) => ({ count: acc.count + p.reviewCount, total: acc.total + p.ratingTotal }), { count: 0, total: 0 });
    const shortName = (n: string) => { const parts = n.trim().split(/\s+/); return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0] ?? "Customer"; };
    return NextResponse.json({
      summary: { count: totals.count, average: totals.count ? Math.round((totals.total / totals.count) * 10) / 10 : 0 },
      items: rows.map(({ customerName, ...r }) => ({ ...r, authorName: shortName(r.source === "IMPORTED" ? r.importedAuthorName ?? "" : customerName ?? ""), photos: media.filter((m) => m.reviewId === r.id).map((m) => "/media/" + m.key) })),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Seller adds a genuine review one of their products earned on another site (with a screenshot). It waits for an admin to check it. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const db = createDatabase();
    await enforceRateLimit(db, request, "reviewImport", { subject: principal.userId });
    const input = importedReviewSchema.parse(await request.json());
    const own = (await db.select({ id: products.id }).from(products).where(and(eq(products.id, input.productId), eq(products.sellerId, principal.sellerId))).limit(1))[0];
    if (!own) throw new AppError("NOT_FOUND", "Product not found");
    const id = await createImportedReview(db, { ...input, addedByUserId: principal.userId, status: "PENDING" });
    return NextResponse.json({ ok: true, id, status: "PENDING" }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
