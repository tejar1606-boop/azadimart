export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
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
        sellerName: sellers.storeName,
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

    return NextResponse.json({
      items: submissions.map((item) => ({
        ...item,
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

import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, mediaAssets, productAplusContent, productMedia, productVariants, products, qcSubmissions, sellers } from "@azadimart/database";
import { AppError, qcDecisionSchema, toApiError } from "@azadimart/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = qcDecisionSchema.parse(await request.json());
    const db = createDatabase();

    const submissions = await db
      .select({
        id: qcSubmissions.id,
        productId: qcSubmissions.productId,
        sellerId: qcSubmissions.sellerId,
        status: qcSubmissions.status,
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
