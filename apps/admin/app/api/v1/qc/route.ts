export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const access = await requireStaff(request, "catalog");
    const db = createDatabase();
    const url = new URL(request.url);
    // Past decisions (who rejected what, and why) are for admins only, not the whole QC team.
    if (url.searchParams.get("view") === "history") {
      if (!access.fullAccess) throw new AppError("FORBIDDEN", "Only admins can see QC history");
      return NextResponse.json({ items: await qcHistory(db, url.searchParams), requestId });
    }

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
    if (!productIds.length) return NextResponse.json({ items: [], canSeeHistory: access.fullAccess });

    const [variants, media, aplus] = await Promise.all([
      db.select({
        productId: productVariants.productId,
        id: productVariants.id,
        sku: productVariants.sku,
        title: productVariants.title,
        pricePaise: productVariants.pricePaise,
        compareAtPaise: productVariants.compareAtPaise,
        weightGrams: productVariants.weightGrams,
        onHand: inventory.onHand,
        attributes: productVariants.attributes,
      }).from(productVariants).leftJoin(inventory, eq(inventory.variantId, productVariants.id))
        .where(and(inArray(productVariants.productId, productIds), eq(productVariants.isActive, true))).orderBy(asc(productVariants.createdAt)),
      db.select({
        productId: productMedia.productId,
        id: productMedia.id,
        kind: productMedia.kind,
        sortOrder: productMedia.sortOrder,
        color: productMedia.color,
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
      // All categories (a small table) so names can show their full path, e.g. "Fashion › Men › T-shirts".
      categoryIds.length ? db.select({ id: categories.id, name: categories.name, parentId: categories.parentId, isActive: categories.isActive }).from(categories) : [],
      proposedMediaIds.length ? db.select({ id: mediaAssets.id, kind: mediaAssets.kind, storageKey: mediaAssets.storageKey }).from(mediaAssets).where(inArray(mediaAssets.id, proposedMediaIds)) : [],
    ]);
    const byId = new Map(categoryRows.map((c) => [c.id, c]));
    const categoryName = new Map(categoryRows.map((c) => {
      const path: string[] = [];
      for (let at: typeof c | undefined = c, depth = 0; at && depth < 6; at = at.parentId ? byId.get(at.parentId) : undefined, depth++) path.unshift(at.name);
      return [c.id, path.join(" › ") + (c.isActive ? "" : " (hidden category)")];
    }));
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
      canSeeHistory: access.fullAccess,
      requestId,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

import { requireStaff } from "@azadimart/auth";
import { applyProductEdit, auditLogs, categories, createDatabase, inventory, mediaAssets, productAplusContent, productMedia, productVariants, products, qcSubmissions, sellers, staffMembers, users } from "@azadimart/database";
import { notifySeller } from "@azadimart/notify";
import { AppError, qcDecisionSchema, toApiError } from "@azadimart/shared";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
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
          const requester = (await tx.select({ userId: sellers.userId }).from(sellers).where(eq(sellers.id, submission.sellerId)).limit(1))[0];
          await applyProductEdit(tx, submission.productId, submission.sellerId, changes, { source: "SELLER_EDIT_APPROVED", requestedByUserId: requester?.userId ?? null, approvedByUserId: principal.userId });
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

const HISTORY_DAYS = [7, 30, 90, 365];

/**
 * Decided QC reviews (newest first): who approved or rejected what, when, and
 * the note sent to the seller. Each resubmission is its own row, so earlier
 * rejections stay visible after the seller fixes a product.
 */
async function qcHistory(db: ReturnType<typeof createDatabase>, params: URLSearchParams) {
  const decision = params.get("decision");
  const days = HISTORY_DAYS.includes(Number(params.get("days"))) ? Number(params.get("days")) : 30;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const filters = [
    decision === "APPROVED" || decision === "REJECTED" ? eq(qcSubmissions.status, decision) : inArray(qcSubmissions.status, ["APPROVED", "REJECTED"]),
    gte(qcSubmissions.updatedAt, new Date(Date.now() - days * 86_400_000)),
  ];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    filters.push(or(ilike(products.title, like), ilike(sellers.storeName, like), sql`exists (select 1 from product_variants v where v.product_id = ${products.id} and v.sku ilike ${like})`)!);
  }
  const rows = await db.select({
    id: qcSubmissions.id,
    productId: qcSubmissions.productId,
    decision: qcSubmissions.status,
    notes: qcSubmissions.notes,
    submittedAt: qcSubmissions.createdAt,
    decidedAt: qcSubmissions.updatedAt,
    isEdit: sql<boolean>`${qcSubmissions.proposedChanges} is not null`,
    productTitle: products.title,
    productStatus: products.status,
    sellerName: sellers.storeName,
    reviewer: sql<string | null>`coalesce(${staffMembers.displayName}, split_part(${users.email}, '@', 1))`,
  }).from(qcSubmissions)
    .innerJoin(products, eq(products.id, qcSubmissions.productId))
    .innerJoin(sellers, eq(sellers.id, qcSubmissions.sellerId))
    .leftJoin(users, eq(users.id, qcSubmissions.reviewedByUserId))
    .leftJoin(staffMembers, eq(staffMembers.userId, qcSubmissions.reviewedByUserId))
    .where(and(...filters))
    .orderBy(desc(qcSubmissions.updatedAt))
    .limit(500);
  return rows;
}
