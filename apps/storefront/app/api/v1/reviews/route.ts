import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { createDatabase, mediaAssets, orderItems, orders, productReviewMedia, productReviews, products, refreshProductRating } from "@azadimart/database";
import { AppError, reviewSubmitSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { loadReviewSummary, loadReviews, type ReviewSort } from "../../../lib/reviews";

export const dynamic = "force-dynamic";

/** Public: rating summary and a page of published reviews for a live product. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId") ?? "";
    if (!uuidSchema.safeParse(productId).success) throw new AppError("VALIDATION_ERROR", "Invalid product");
    const sort = (["recent", "highest", "lowest", "photos"].includes(url.searchParams.get("sort") ?? "") ? url.searchParams.get("sort") : "recent") as ReviewSort;
    const rating = Number(url.searchParams.get("rating")) || undefined;
    const offset = Number(url.searchParams.get("offset")) || 0;
    const db = createDatabase();
    const live = (await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.status, "LIVE"))).limit(1))[0];
    if (!live) throw new AppError("NOT_FOUND", "Product not found");
    const [summary, page] = await Promise.all([loadReviewSummary(db, productId), loadReviews(db, productId, { sort, rating, offset })]);
    return NextResponse.json({ summary, ...page });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/**
 * Create or update the signed-in customer's review. Only verified buyers: the
 * customer must have a delivered order containing this product. Photos must be
 * the customer's own review uploads.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!principal.customerId) throw new AppError("FORBIDDEN", "Customer profile required");
    const customerId = principal.customerId;
    const db = createDatabase();
    await enforceRateLimit(db, request, "review", { subject: principal.userId, rule: { limit: 20, windowSeconds: 60 * 60 } });
    const input = reviewSubmitSchema.parse(await request.json());

    const purchase = (await db.select({ orderItemId: orderItems.id }).from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.productId, input.productId), eq(orders.customerId, customerId), eq(orders.status, "DELIVERED")))
      .orderBy(desc(orders.deliveredAt)).limit(1))[0];
    if (!purchase) throw new AppError("FORBIDDEN", "Only customers who received this product can review it.");

    if (input.mediaAssetIds.length) {
      const owned = await db.select({ id: mediaAssets.id, key: mediaAssets.storageKey, kind: mediaAssets.kind }).from(mediaAssets)
        .where(and(inArray(mediaAssets.id, input.mediaAssetIds), eq(mediaAssets.uploadedByUserId, principal.userId)));
      if (owned.length !== input.mediaAssetIds.length || owned.some((m) => m.kind !== "IMAGE" || !m.key.startsWith(`review-media/${customerId}/`))) {
        throw new AppError("FORBIDDEN", "Photos must be your own uploads");
      }
    }

    const saved = await db.transaction(async (tx) => {
      const existing = (await tx.select({ id: productReviews.id, status: productReviews.status }).from(productReviews)
        .where(and(eq(productReviews.productId, input.productId), eq(productReviews.customerId, customerId))).limit(1).for("update"))[0];
      // A hidden review stays hidden when edited; admins decide whether to restore it.
      const review = existing
        ? (await tx.update(productReviews).set({ rating: input.rating, title: input.title || null, body: input.body || null, orderItemId: purchase.orderItemId, updatedAt: new Date() })
          .where(eq(productReviews.id, existing.id)).returning())[0]!
        : (await tx.insert(productReviews).values({ productId: input.productId, customerId, orderItemId: purchase.orderItemId, rating: input.rating, title: input.title || null, body: input.body || null })
          .returning())[0]!;
      await tx.delete(productReviewMedia).where(eq(productReviewMedia.reviewId, review.id));
      if (input.mediaAssetIds.length) {
        await tx.insert(productReviewMedia).values(input.mediaAssetIds.map((mediaAssetId, sortOrder) => ({ reviewId: review.id, mediaAssetId, sortOrder })));
      }
      await refreshProductRating(tx, input.productId);
      return { id: review.id, status: review.status, created: !existing };
    });
    return NextResponse.json({ ok: true, review: saved }, { status: saved.created ? 201 : 200 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
