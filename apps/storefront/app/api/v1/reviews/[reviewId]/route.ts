import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, productReviews, refreshProductRating } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Customers can delete their own review. */
export async function DELETE(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    const { reviewId } = await params;
    if (!uuidSchema.safeParse(reviewId).success || !principal.customerId) throw new AppError("NOT_FOUND", "Review not found");
    const db = createDatabase();
    await db.transaction(async (tx) => {
      const removed = (await tx.delete(productReviews).where(and(eq(productReviews.id, reviewId), eq(productReviews.customerId, principal.customerId!))).returning({ productId: productReviews.productId }))[0];
      if (!removed) throw new AppError("NOT_FOUND", "Review not found");
      await refreshProductRating(tx, removed.productId);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
