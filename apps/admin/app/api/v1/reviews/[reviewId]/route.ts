import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, productReviews, refreshProductRating } from "@azadimart/database";
import { AppError, adminReviewModerationSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Hide a review (with a reason) or publish it again; the product's stars update at once. */
export async function PATCH(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { reviewId } = await params;
    if (!uuidSchema.safeParse(reviewId).success) throw new AppError("NOT_FOUND", "Review not found");
    const input = adminReviewModerationSchema.parse(await request.json());
    if (input.status === "HIDDEN" && !input.reason) throw new AppError("VALIDATION_ERROR", "Give a reason for hiding this review");
    const db = createDatabase();
    const review = await db.transaction(async (tx) => {
      const current = (await tx.select({ productId: productReviews.productId, status: productReviews.status }).from(productReviews).where(eq(productReviews.id, reviewId)).limit(1).for("update"))[0];
      if (!current) throw new AppError("NOT_FOUND", "Review not found");
      const updated = (await tx.update(productReviews).set({
        status: input.status,
        hiddenReason: input.status === "HIDDEN" ? input.reason! : null,
        hiddenByUserId: input.status === "HIDDEN" ? principal.userId : null,
      }).where(eq(productReviews.id, reviewId)).returning({ id: productReviews.id, status: productReviews.status }))[0]!;
      await refreshProductRating(tx, current.productId);
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: input.status === "HIDDEN" ? "REVIEW_HIDDEN" : "REVIEW_PUBLISHED", entityType: "product_review", entityId: reviewId, metadata: { from: current.status, to: input.status, reason: input.reason ?? null } });
      return updated;
    });
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
