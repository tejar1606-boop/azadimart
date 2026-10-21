import { AppError, type ImportedReviewInput } from "@azadimart/shared";
import { and, eq, like } from "drizzle-orm";
import type { createDatabase } from "./client";
import { auditLogs, mediaAssets } from "./schema/index";
import { productReviews } from "./schema/reviews";

type Db = ReturnType<typeof createDatabase>;

/** Records a proof screenshot (already stored privately) so a review can point to it. */
export async function recordReviewProof(db: Db, userId: string, file: { key: string; mimeType: string; byteSize: number }): Promise<string> {
  const row = (await db.insert(mediaAssets).values({ kind: "DOCUMENT", storageKey: file.key, mimeType: file.mimeType, byteSize: file.byteSize, uploadedByUserId: userId })
    .returning({ id: mediaAssets.id }))[0];
  if (!row) throw new AppError("INTERNAL", "Could not save the screenshot", undefined, false);
  return row.id;
}

/**
 * Adds a genuine review the product earned elsewhere. An admin's import goes
 * live at once; a seller's waits (PENDING) for an admin to check the proof.
 * The proof must be a screenshot this same person uploaded. Imported reviews
 * never change the star rating.
 */
export async function createImportedReview(db: Db, input: ImportedReviewInput & { addedByUserId: string; status: "PUBLISHED" | "PENDING" }): Promise<string> {
  const proof = (await db.select({ id: mediaAssets.id }).from(mediaAssets)
    .where(and(eq(mediaAssets.id, input.proofAssetId), eq(mediaAssets.kind, "DOCUMENT"), like(mediaAssets.storageKey, `review-proofs/${input.addedByUserId}/%`))).limit(1))[0];
  if (!proof) throw new AppError("VALIDATION_ERROR", "Upload a screenshot of the original review first");
  return db.transaction(async (tx) => {
    const row = (await tx.insert(productReviews).values({
      productId: input.productId, source: "IMPORTED", status: input.status,
      rating: input.rating, title: input.title || null, body: input.body,
      importedAuthorName: input.authorName, importedSourceName: input.sourceName, importedReviewedAt: input.reviewedAt,
      importProofAssetId: proof.id, addedByUserId: input.addedByUserId,
    }).returning({ id: productReviews.id }))[0];
    if (!row) throw new AppError("INTERNAL", "Could not add the review", undefined, false);
    await tx.insert(auditLogs).values({ actorUserId: input.addedByUserId, action: "REVIEW_IMPORTED", entityType: "product_review", entityId: row.id, metadata: { productId: input.productId, source: input.sourceName, status: input.status } });
    return row.id;
  });
}
