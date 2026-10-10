import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, mediaAssets, orderItems, orders, productReviewMedia, productReviews } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Can the visitor review this product? Returns their existing review so they can edit it. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const productId = new URL(request.url).searchParams.get("productId") ?? "";
    if (!uuidSchema.safeParse(productId).success) throw new AppError("VALIDATION_ERROR", "Invalid product");
    const db = createDatabase();
    const principal = await getSessionPrincipal(request, db);
    if (!principal || principal.role !== "CUSTOMER" || !principal.customerId) return NextResponse.json({ signedIn: false, canReview: false, review: null });
    const [purchase, review] = await Promise.all([
      db.select({ id: orderItems.id }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orderItems.productId, productId), eq(orders.customerId, principal.customerId), eq(orders.status, "DELIVERED"))).limit(1).then((r) => r[0]),
      db.select({ id: productReviews.id, rating: productReviews.rating, title: productReviews.title, body: productReviews.body, status: productReviews.status })
        .from(productReviews).where(and(eq(productReviews.productId, productId), eq(productReviews.customerId, principal.customerId))).limit(1).then((r) => r[0]),
    ]);
    const photos = review ? await db.select({ id: mediaAssets.id, key: mediaAssets.storageKey }).from(productReviewMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, productReviewMedia.mediaAssetId)).where(eq(productReviewMedia.reviewId, review.id)).orderBy(asc(productReviewMedia.sortOrder)) : [];
    return NextResponse.json({
      signedIn: true,
      canReview: Boolean(purchase),
      review: review ? { ...review, photos: photos.map((p) => ({ mediaAssetId: p.id, url: "/media/" + p.key })) } : null,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
