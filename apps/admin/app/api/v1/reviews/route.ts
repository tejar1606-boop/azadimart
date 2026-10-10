import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, customers, mediaAssets, productReviewMedia, productReviews, products, sellers, users } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

/** All reviews for moderation: filter by status and star rating, search product, seller or customer. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const rating = Number(url.searchParams.get("rating"));
    const q = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const filters: SQL[] = [];
    if (status === "PUBLISHED" || status === "HIDDEN") filters.push(eq(productReviews.status, status));
    if (rating >= 1 && rating <= 5) filters.push(eq(productReviews.rating, rating));
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
      filters.push(or(ilike(products.title, like), ilike(sellers.storeName, like), ilike(customers.fullName, like), ilike(users.email, like), ilike(productReviews.title, like), ilike(productReviews.body, like))!);
    }
    const db = createDatabase();
    const rows = await db.select({
      id: productReviews.id, rating: productReviews.rating, title: productReviews.title, body: productReviews.body,
      status: productReviews.status, hiddenReason: productReviews.hiddenReason, sellerReply: productReviews.sellerReply,
      createdAt: productReviews.createdAt, productTitle: products.title, productSlug: products.slug,
      sellerName: sellers.storeName, customerName: customers.fullName, customerEmail: users.email,
    }).from(productReviews)
      .innerJoin(products, eq(products.id, productReviews.productId))
      .innerJoin(sellers, eq(sellers.id, products.sellerId))
      .innerJoin(customers, eq(customers.id, productReviews.customerId))
      .innerJoin(users, eq(users.id, customers.userId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(productReviews.createdAt)).limit(200);
    const media = rows.length ? await db.select({ reviewId: productReviewMedia.reviewId, key: mediaAssets.storageKey }).from(productReviewMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, productReviewMedia.mediaAssetId)).where(inArray(productReviewMedia.reviewId, rows.map((r) => r.id))).orderBy(asc(productReviewMedia.sortOrder)) : [];
    return NextResponse.json({ items: rows.map((r) => ({ ...r, photos: media.filter((m) => m.reviewId === r.id).map((m) => "/media/" + m.key) })) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
