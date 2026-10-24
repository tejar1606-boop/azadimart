import { requireStaff } from "@azadimart/auth";
import { createDatabase, mediaAssets, productReviews } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { REVIEW_PROOF_PREFIX, getObjectStore } from "@azadimart/storage";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** The private screenshot proving an imported review is genuine (admins only). */
export async function GET(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "catalog");
    const { reviewId } = await params;
    if (!uuidSchema.safeParse(reviewId).success) throw new AppError("NOT_FOUND", "Review not found");
    const proof = (await createDatabase().select({ key: mediaAssets.storageKey, mimeType: mediaAssets.mimeType }).from(productReviews)
      .innerJoin(mediaAssets, eq(mediaAssets.id, productReviews.importProofAssetId)).where(eq(productReviews.id, reviewId)).limit(1))[0];
    if (!proof || !proof.key.startsWith(REVIEW_PROOF_PREFIX)) throw new AppError("NOT_FOUND", "No screenshot for this review");
    const bytes = await getObjectStore().get(proof.key);
    if (!bytes) throw new AppError("NOT_FOUND", "The screenshot file is missing");
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": proof.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
