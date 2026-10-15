import { enforceRateLimit } from "@azadimart/auth";
import { applyProductEdit, auditLogs, categories, loadProductForEdit, mediaAssets, productMedia, products, qcSubmissions, setProductStock, type ProductEditChanges } from "@azadimart/database";
import { AppError, productEditSchema, toApiError } from "@azadimart/shared";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOwnedProduct } from "./aplus/shared";

type Status = typeof products.$inferSelect.status;

/** The product as the seller's Edit page shows it, plus any edit waiting in QC. */
export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { productId } = await params;
    const { db, principal } = await requireOwnedProduct(request, productId);
    const data = await loadProductForEdit(db, productId, principal.sellerId);
    if (!data) throw new AppError("NOT_FOUND", "Product not found");
    return NextResponse.json(data);
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/**
 * Saves a seller's edit.
 * - Draft / rejected: applied straight away (the seller then submits for QC).
 * - In review: applied, and the product restarts QC so the reviewer sees the latest version.
 * - Live / hidden: stock is applied now; everything else waits in QC and the
 *   current listing stays on the store until QC approves the change.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { productId } = await params;
    const { db, principal, product } = await requireOwnedProduct(request, productId);
    await enforceRateLimit(db, request, "productCreate", { subject: principal.userId });
    const input = productEditSchema.parse(await request.json());
    const status = product.status as Status;
    if (status === "ARCHIVED") throw new AppError("CONFLICT", "This product was removed by LOIMART and can't be edited");

    const category = (await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.isActive, true))).limit(1))[0];
    if (!category) throw new AppError("VALIDATION_ERROR", "Choose an active category");

    // Media must be this seller's own uploads, or already on this product.
    const assetIds = [...input.imageAssetIds, ...(input.videoAssetId ? [input.videoAssetId] : [])];
    const attached = db.select({ id: productMedia.mediaAssetId }).from(productMedia).where(eq(productMedia.productId, productId));
    const assets = await db.select({ id: mediaAssets.id, kind: mediaAssets.kind }).from(mediaAssets)
      .where(and(inArray(mediaAssets.id, assetIds), or(eq(mediaAssets.uploadedByUserId, principal.userId), inArray(mediaAssets.id, attached))));
    if (assets.length !== assetIds.length) throw new AppError("FORBIDDEN", "One or more photos or videos are not from your account");
    const kindById = new Map(assets.map((a) => [a.id, a.kind]));
    if (input.imageAssetIds.some((id) => kindById.get(id) !== "IMAGE")) throw new AppError("VALIDATION_ERROR", "Product photos must be images");
    if (input.videoAssetId && kindById.get(input.videoAssetId) !== "VIDEO") throw new AppError("VALIDATION_ERROR", "The product video must be a video");

    const changes: ProductEditChanges = {
      title: input.title,
      categoryId: input.categoryId,
      description: input.description || null,
      specifications: input.specifications ?? [],
      couponMaxDiscountPct: input.couponMaxDiscountPct,
      imageAssetIds: input.imageAssetIds,
      videoAssetId: input.videoAssetId ?? null,
      variant: { sku: input.variant.sku, title: input.variant.title, pricePaise: input.variant.pricePaise, compareAtPaise: input.variant.compareAtPaise ?? null, weightGrams: input.variant.weightGrams },
    };

    const mode = await db.transaction(async (tx) => {
      await setProductStock(tx, productId, input.onHand);

      if (status === "LIVE" || status === "UNLISTED") {
        // One open edit per product: a newer edit replaces the one waiting in QC.
        const open = (await tx.select({ id: qcSubmissions.id }).from(qcSubmissions)
          .where(and(eq(qcSubmissions.productId, productId), isNotNull(qcSubmissions.proposedChanges), inArray(qcSubmissions.status, ["PENDING", "IN_REVIEW"]))).limit(1))[0];
        if (open) await tx.update(qcSubmissions).set({ proposedChanges: changes, status: "PENDING", notes: null, updatedAt: new Date() }).where(eq(qcSubmissions.id, open.id));
        else await tx.insert(qcSubmissions).values({ productId, sellerId: principal.sellerId, proposedChanges: changes, status: "PENDING" });
        await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "PRODUCT_EDIT_SUBMITTED", entityType: "product", entityId: productId, metadata: { status } });
        return "review" as const;
      }

      await applyProductEdit(tx, productId, principal.sellerId, changes);
      if (status === "PENDING_QC" || status === "PENDING_ADMIN_APPROVAL") {
        // Content changed during review: start QC again on the new version.
        await tx.update(qcSubmissions).set({ status: "REJECTED", notes: "Replaced by the seller's newer edit", updatedAt: new Date() })
          .where(and(eq(qcSubmissions.productId, productId), isNull(qcSubmissions.proposedChanges), inArray(qcSubmissions.status, ["PENDING", "IN_REVIEW"])));
        await tx.insert(qcSubmissions).values({ productId, sellerId: principal.sellerId, status: "PENDING", notes: "Updated by seller during review" });
        await tx.update(products).set({ status: "PENDING_QC", updatedAt: new Date() }).where(eq(products.id, productId));
        await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "PRODUCT_EDITED_IN_REVIEW", entityType: "product", entityId: productId, metadata: { status } });
        return "resubmitted" as const;
      }
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "PRODUCT_EDITED", entityType: "product", entityId: productId, metadata: { status } });
      return "saved" as const;
    });

    const message = mode === "review"
      ? "Changes sent to QC. Your current listing stays live until they're approved. Stock is already updated."
      : mode === "resubmitted" ? "Changes saved and sent back to QC for review." : "Changes saved. Submit for QC when you're ready.";
    return NextResponse.json({ ok: true, mode, message });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
