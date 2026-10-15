export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "catalog");
    const db = createDatabase();

    const submissions = await db
      .select({
        id: qcSubmissions.id,
        productId: qcSubmissions.productId,
        sellerId: qcSubmissions.sellerId,
        status: qcSubmissions.status,
        notes: qcSubmissions.notes,
        createdAt: qcSubmissions.createdAt,
        productTitle: products.title,
        productSlug: products.slug,
        productStatus: products.status,
        sellerName: sellers.storeName,
        // Edit requests for live products carry the new details; current values come from the product.
        proposedChanges: qcSubmissions.proposedChanges,
        current: { categoryId: products.categoryId, description: products.description, specifications: products.specifications, couponMaxDiscountPct: products.couponMaxDiscountPct },
      })
      .from(qcSubmissions)
      .innerJoin(products, eq(products.id, qcSubmissions.productId))
      .innerJoin(sellers, eq(sellers.id, qcSubmissions.sellerId))
      .where(inArray(qcSubmissions.status, ["PENDING", "IN_REVIEW"]))
      .orderBy(asc(qcSubmissions.createdAt));

    const productIds = submissions.map((item) => item.productId);
    if (!productIds.length) return NextResponse.json({ items: [] });

    const [variants, media, aplus] = await Promise.all([
      db.select({
        productId: productVariants.productId,
        id: productVariants.id,
        sku: productVariants.sku,
        title: productVariants.title,
        pricePaise: productVariants.pricePaise,
        compareAtPaise: productVariants.compareAtPaise,
        weightGrams: productVariants.weightGrams,
      }).from(productVariants).where(inArray(productVariants.productId, productIds)),
      db.select({
        productId: productMedia.productId,
        id: productMedia.id,
        kind: productMedia.kind,
        sortOrder: productMedia.sortOrder,
        storageKey: mediaAssets.storageKey,
        altText: mediaAssets.altText,
      }).from(productMedia)
        .innerJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
        .where(inArray(productMedia.productId, productIds))
        .orderBy(asc(productMedia.sortOrder)),
      db.select({
        productId: productAplusContent.productId,
        blocks: productAplusContent.draftBlocks,
      }).from(productAplusContent).where(inArray(productAplusContent.productId, productIds)),
    ]);

    const variantMap = new Map<string, typeof variants>();
    for (const item of variants) {
      const current = variantMap.get(item.productId) ?? [];
      current.push(item);
      variantMap.set(item.productId, current);
    }
    const mediaMap = new Map<string, typeof media>();
    for (const item of media) {
      const current = mediaMap.get(item.productId) ?? [];
      current.push(item);
      mediaMap.set(item.productId, current);
    }
    const aplusMap = new Map(aplus.map((item) => [item.productId, item.blocks]));

    // Names and previews for edit requests: categories (current and proposed) and the proposed media.
    const edits = submissions.filter((item) => item.proposedChanges);
    const categoryIds = [...new Set(submissions.flatMap((item) => [item.current.categoryId, item.proposedChanges?.categoryId]).filter((id): id is string => Boolean(id)))];
    const proposedMediaIds = [...new Set(edits.flatMap((item) => [...item.proposedChanges!.imageAssetIds, ...(item.proposedChanges!.videoAssetId ? [item.proposedChanges!.videoAssetId] : [])]))];
    const [categoryRows, proposedMedia] = await Promise.all([
      categoryIds.length ? db.select({ id: categories.id, name: categories.name }).from(categories).where(inArray(categories.id, categoryIds)) : [],
      proposedMediaIds.length ? db.select({ id: mediaAssets.id, kind: mediaAssets.kind, storageKey: mediaAssets.storageKey }).from(mediaAssets).where(inArray(mediaAssets.id, proposedMediaIds)) : [],
    ]);
    const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));
    const mediaById = new Map(proposedMedia.map((m) => [m.id, m]));

    return NextResponse.json({
      items: submissions.map((item) => ({
        ...item,
        kind: item.proposedChanges ? "EDIT" : "NEW_LISTING",
        currentCategoryName: categoryName.get(item.current.categoryId) ?? null,
        proposedCategoryName: item.proposedChanges ? categoryName.get(item.proposedChanges.categoryId) ?? null : null,
        proposedMedia: item.proposedChanges ? [...item.proposedChanges.imageAssetIds, ...(item.proposedChanges.videoAssetId ? [item.proposedChanges.videoAssetId] : [])].map((id) => mediaById.get(id)).filter(Boolean) : [],
        variants: variantMap.get(item.productId) ?? [],
        media: mediaMap.get(item.productId) ?? [],
        aplusBlocks: aplusMap.get(item.productId) ?? [],
      })),
      requestId,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

import { requireStaff } from "@azadimart/auth";
import { applyProductEdit, auditLogs, categories, createDatabase, mediaAssets, productAplusContent, productMedia, productVariants, products, qcSubmissions, sellers } from "@azadimart/database";
import { notifySeller } from "@azadimart/notify";
import { AppError, qcDecisionSchema, toApiError } from "@azadimart/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireStaff(request, "catalog");
    const input = qcDecisionSchema.parse(await request.json());
    const db = createDatabase();

    const submissions = await db
      .select({
        id: qcSubmissions.id,
        productId: qcSubmissions.productId,
        sellerId: qcSubmissions.sellerId,
        status: qcSubmissions.status,
        proposedChanges: qcSubmissions.proposedChanges,
      })
      .from(qcSubmissions)
      .where(eq(qcSubmissions.id, input.qcSubmissionId))
      .limit(1);

    const submission = submissions[0];
    if (!submission) {
      throw new AppError("NOT_FOUND", "QC submission not found");
    }
    if (!["PENDING", "IN_REVIEW"].includes(submission.status)) {
      throw new AppError("CONFLICT", "QC submission is already finalized");
    }

    // An edit to a live product: approving applies the new details in one step (the product
    // keeps its status); rejecting discards them and the current listing stays as it is.
    if (submission.proposedChanges) {
      const changes = submission.proposedChanges;
      await db.transaction(async (tx) => {
        const updated = await tx.update(qcSubmissions)
          .set({ status: input.decision, notes: input.notes ?? null, reviewedByUserId: principal.userId, updatedAt: new Date() })
          .where(and(eq(qcSubmissions.id, submission.id), inArray(qcSubmissions.status, ["PENDING", "IN_REVIEW"])))
          .returning({ id: qcSubmissions.id });
        if (!updated[0]) throw new AppError("CONFLICT", "QC submission is no longer awaiting review");
        if (input.decision === "APPROVED") {
          const product = (await tx.select({ status: products.status }).from(products).where(eq(products.id, submission.productId)).limit(1))[0];
          if (!product || product.status === "ARCHIVED") throw new AppError("CONFLICT", "This product was removed, so the edit can't be applied");
          await applyProductEdit(tx, submission.productId, submission.sellerId, changes);
        }
        await tx.insert(auditLogs).values({
          actorUserId: principal.userId,
          action: `PRODUCT_EDIT_${input.decision}`,
          entityType: "qc_submission",
          entityId: submission.id,
          metadata: { productId: submission.productId, sellerId: submission.sellerId, notes: input.notes ?? null },
        });
      });
      await notifySeller(db, {
        sellerId: submission.sellerId,
        kind: "PRODUCT_REVIEWED",
        title: input.decision === "APPROVED" ? `Changes approved: ${changes.title}` : `Changes not approved: ${changes.title}`,
        body: input.decision === "APPROVED" ? "Your updated details are now live." : (input.notes ? `QC note: ${input.notes}` : "Your current listing is unchanged. Edit and resubmit any time."),
        href: `/products/${submission.productId}/edit`,
        dedupeKey: `PRODUCT_EDIT:${submission.id}`,
      }).catch(() => false);
      return NextResponse.json({ ok: true, qcSubmissionId: submission.id, productId: submission.productId, status: input.decision, kind: "EDIT" });
    }

    const nextProductStatus = input.decision === "APPROVED" ? "PENDING_ADMIN_APPROVAL" : "QC_REJECTED";

    await db.transaction(async (tx) => {
      const updatedSubmission = await tx
        .update(qcSubmissions)
        .set({
          status: input.decision,
          notes: input.notes ?? null,
          reviewedByUserId: principal.userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(qcSubmissions.id, submission.id),
            inArray(qcSubmissions.status, ["PENDING", "IN_REVIEW"]),
          ),
        )
        .returning({ id: qcSubmissions.id });

      if (!updatedSubmission[0]) {
        throw new AppError("CONFLICT", "QC submission is no longer awaiting review");
      }

      const updatedProduct = await tx
        .update(products)
        .set({ status: nextProductStatus, updatedAt: new Date() })
        .where(
          and(
            eq(products.id, submission.productId),
            eq(products.status, "PENDING_QC"),
          ),
        )
        .returning({ id: products.id });

      if (!updatedProduct[0]) {
        throw new AppError("CONFLICT", "Product is no longer awaiting QC review");
      }

      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: `QC_${input.decision}`,
        entityType: "qc_submission",
        entityId: submission.id,
        metadata: {
          productId: submission.productId,
          sellerId: submission.sellerId,
          notes: input.notes ?? null,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      qcSubmissionId: submission.id,
      productId: submission.productId,
      status: input.decision,
      productStatus: nextProductStatus,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
