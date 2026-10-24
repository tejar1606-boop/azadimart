import { requireStaff } from "@azadimart/auth";
import { auditLogs, createDatabase, productReviews, refreshProductRating } from "@azadimart/database";
import { AppError, adminReviewModerationSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Hide a review (with a reason), publish it (again, or approve a seller's
 * imported review), and/or pin it to the top of the product's reviews.
 * The product's stars update at once.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "catalog");
    const { reviewId } = await params;
    if (!uuidSchema.safeParse(reviewId).success) throw new AppError("NOT_FOUND", "Review not found");
    const input = adminReviewModerationSchema.parse(await request.json());
    if (input.status === "HIDDEN" && !input.reason) throw new AppError("VALIDATION_ERROR", "Give a reason for hiding this review");
    const db = createDatabase();
    const review = await db.transaction(async (tx) => {
      const current = (await tx.select({ productId: productReviews.productId, status: productReviews.status, pinnedAt: productReviews.pinnedAt }).from(productReviews).where(eq(productReviews.id, reviewId)).limit(1).for("update"))[0];
      if (!current) throw new AppError("NOT_FOUND", "Review not found");
      const status = input.status ?? current.status;
      if (input.pinned && status !== "PUBLISHED") throw new AppError("VALIDATION_ERROR", "Only live reviews can be pinned");
      const updated = (await tx.update(productReviews).set({
        ...(input.status ? {
          status: input.status,
          hiddenReason: input.status === "HIDDEN" ? input.reason! : null,
          hiddenByUserId: input.status === "HIDDEN" ? principal.userId : null,
        } : {}),
        // Hidden reviews are never pinned.
        pinnedAt: status !== "PUBLISHED" ? null : input.pinned === undefined ? current.pinnedAt : input.pinned ? new Date() : null,
      }).where(eq(productReviews.id, reviewId)).returning({ id: productReviews.id, status: productReviews.status, pinnedAt: productReviews.pinnedAt }))[0]!;
      await refreshProductRating(tx, current.productId);
      const action = input.status === "HIDDEN" ? "REVIEW_HIDDEN" : input.status === "PUBLISHED" ? (current.status === "PENDING" ? "REVIEW_IMPORT_APPROVED" : "REVIEW_PUBLISHED") : input.pinned ? "REVIEW_PINNED" : "REVIEW_UNPINNED";
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action, entityType: "product_review", entityId: reviewId, metadata: { from: current.status, to: updated.status, reason: input.reason ?? null, pinned: Boolean(updated.pinnedAt) } });
      return updated;
    });
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
