import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, productReviews, products } from "@azadimart/database";
import { AppError, sellerReviewReplySchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Post, edit or remove ("" ) the seller's public reply to a review of one of their products. */
export async function POST(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { reviewId } = await params;
    if (!uuidSchema.safeParse(reviewId).success) throw new AppError("NOT_FOUND", "Review not found");
    const input = sellerReviewReplySchema.parse(await request.json());
    const db = createDatabase();
    await enforceRateLimit(db, request, "reviewReply", { subject: principal.userId, rule: { limit: 60, windowSeconds: 60 * 60 } });
    const owned = (await db.select({ id: productReviews.id }).from(productReviews).innerJoin(products, eq(products.id, productReviews.productId))
      .where(and(eq(productReviews.id, reviewId), eq(products.sellerId, principal.sellerId), eq(productReviews.status, "PUBLISHED"))).limit(1))[0];
    if (!owned) throw new AppError("NOT_FOUND", "Review not found");
    await db.update(productReviews).set({ sellerReply: input.reply || null, sellerRepliedAt: input.reply ? new Date() : null }).where(eq(productReviews.id, reviewId));
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: input.reply ? "REVIEW_REPLY_SAVED" : "REVIEW_REPLY_REMOVED", entityType: "product_review", entityId: reviewId, metadata: { length: input.reply.length } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
