import { AppError, bulkReviewRowSchema, type ImportedReviewInput } from "@azadimart/shared";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import { auditLogs, mediaAssets, productVariants, products } from "./schema/index";
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
  const proof = await ownProof(db, input.proofAssetId, input.addedByUserId);
  return db.transaction(async (tx) => {
    const row = (await tx.insert(productReviews).values({
      productId: input.productId, source: "IMPORTED", status: input.status,
      rating: input.rating, title: input.title || null, body: input.body,
      importedAuthorName: input.authorName, importedSourceName: input.sourceName, importedReviewedAt: input.reviewedAt,
      importProofAssetId: proof, addedByUserId: input.addedByUserId,
    }).returning({ id: productReviews.id }))[0];
    if (!row) throw new AppError("INTERNAL", "Could not add the review", undefined, false);
    await tx.insert(auditLogs).values({ actorUserId: input.addedByUserId, action: "REVIEW_IMPORTED", entityType: "product_review", entityId: row.id, metadata: { productId: input.productId, source: input.sourceName, status: input.status } });
    return row.id;
  });
}

/** The proof must be a private review proof uploaded by this same person. */
async function ownProof(db: Db, proofAssetId: string, userId: string): Promise<string> {
  const proof = (await db.select({ id: mediaAssets.id }).from(mediaAssets)
    .where(and(eq(mediaAssets.id, proofAssetId), eq(mediaAssets.kind, "DOCUMENT"), like(mediaAssets.storageKey, `review-proofs/${userId}/%`))).limit(1))[0];
  if (!proof) throw new AppError("VALIDATION_ERROR", "Upload a screenshot of the original review first");
  return proof.id;
}

export type BulkReviewProblem = { line: number; message: string };

/**
 * Bulk import from a CSV: every row is checked (fields, SKU belongs to this
 * seller, not already imported, not repeated in the file). Nothing is saved
 * if any row has a problem, or when dryRun is set. All rows share the one
 * proof file, so an admin can approve or reject the upload together.
 * line: the row's line in the file (the header is line 1).
 */
export async function importReviewBatch(db: Db, input: { rows: unknown[]; proofAssetId: string; addedByUserId: string; sellerId: string | null; status: "PUBLISHED" | "PENDING"; dryRun: boolean }):
  Promise<{ ok: boolean; problems: BulkReviewProblem[]; ready: number; created: number }> {
  const proof = await ownProof(db, input.proofAssetId, input.addedByUserId);
  const problems: BulkReviewProblem[] = [];
  const parsed = input.rows.map((raw, i) => {
    const result = bulkReviewRowSchema.safeParse(raw);
    if (!result.success) for (const issue of result.error.issues.slice(0, 3)) problems.push({ line: i + 2, message: issue.message });
    return result.success ? result.data : null;
  });

  // SKU -> product (only this seller's products when a seller uploads; archived products are skipped).
  const skus = [...new Set(parsed.flatMap((r) => (r ? [r.sku.toUpperCase()] : [])))];
  const found = skus.length ? await db.select({ sku: productVariants.sku, productId: products.id, sellerId: products.sellerId, status: products.status })
    .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(inArray(sql`upper(${productVariants.sku})`, skus)) : [];
  const bySku = new Map(found.map((f) => [f.sku.toUpperCase(), f]));

  // Already imported (same product, reviewer and text) or repeated in this file.
  const productIds = [...new Set(found.map((f) => f.productId))];
  const existing = productIds.length ? await db.select({ productId: productReviews.productId, author: productReviews.importedAuthorName, body: productReviews.body })
    .from(productReviews).where(and(inArray(productReviews.productId, productIds), eq(productReviews.source, "IMPORTED"))) : [];
  const fingerprint = (productId: string, author: string, body: string | null) => `${productId}|${author.trim().toLowerCase()}|${(body ?? "").trim().toLowerCase()}`;
  const seen = new Set(existing.map((e) => fingerprint(e.productId, e.author ?? "", e.body)));

  const ready: Array<{ productId: string; row: NonNullable<(typeof parsed)[number]> }> = [];
  parsed.forEach((row, i) => {
    if (!row) return;
    const line = i + 2;
    const match = bySku.get(row.sku.toUpperCase());
    if (!match || (input.sellerId && match.sellerId !== input.sellerId)) { problems.push({ line, message: `No product with SKU ${row.sku}${input.sellerId ? " in your catalogue" : ""}` }); return; }
    if (match.status === "ARCHIVED") { problems.push({ line, message: `SKU ${row.sku} belongs to an archived product` }); return; }
    const key = fingerprint(match.productId, row.authorName, row.body);
    if (seen.has(key)) { problems.push({ line, message: "This review is already on LOIMART (same product, reviewer and text)" }); return; }
    seen.add(key);
    ready.push({ productId: match.productId, row });
  });

  if (problems.length || input.dryRun) return { ok: !problems.length, problems: problems.sort((a, b) => a.line - b.line), ready: ready.length, created: 0 };

  await db.transaction(async (tx) => {
    const rows = await tx.insert(productReviews).values(ready.map(({ productId, row }) => ({
      productId, source: "IMPORTED" as const, status: input.status, rating: row.rating, title: row.title || null, body: row.body,
      importedAuthorName: row.authorName, importedSourceName: row.sourceName, importedReviewedAt: row.reviewedAt,
      importProofAssetId: proof, addedByUserId: input.addedByUserId,
    }))).returning({ id: productReviews.id });
    await tx.insert(auditLogs).values({ actorUserId: input.addedByUserId, action: "REVIEW_BULK_IMPORTED", entityType: "media_asset", entityId: proof, metadata: { count: rows.length, status: input.status, sellerId: input.sellerId } });
  });
  return { ok: true, problems: [], ready: ready.length, created: ready.length };
}

/** Admin: approve or reject every waiting review from one upload (they share the proof file). */
export async function decideReviewBatch(db: Db, input: { proofAssetId: string; decision: "APPROVE" | "REJECT"; reason?: string; adminUserId: string }): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx.update(productReviews).set(input.decision === "APPROVE"
      ? { status: "PUBLISHED", hiddenReason: null, hiddenByUserId: null }
      : { status: "HIDDEN", hiddenReason: input.reason!, hiddenByUserId: input.adminUserId })
      .where(and(eq(productReviews.importProofAssetId, input.proofAssetId), eq(productReviews.status, "PENDING")))
      .returning({ id: productReviews.id });
    if (!rows.length) throw new AppError("NOT_FOUND", "No waiting reviews from this upload");
    await tx.insert(auditLogs).values({ actorUserId: input.adminUserId, action: input.decision === "APPROVE" ? "REVIEW_BATCH_APPROVED" : "REVIEW_BATCH_REJECTED", entityType: "media_asset", entityId: input.proofAssetId, metadata: { count: rows.length, reason: input.reason ?? null } });
    return rows.length;
  });
}
