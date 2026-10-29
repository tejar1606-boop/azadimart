import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { auditLogs, categories, createDatabase, mediaAssets, productVariants, sellers } from "@azadimart/database";
import { AppError, productBulkCreateSchema, productDraftSchema, toApiError, type ProductDraftInput } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { insertSellerProduct } from "../create-product";

type Result = { row: number; ok: boolean; productId?: string; status?: string; error?: string };

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

/**
 * Bulk upload: creates up to BULK_PRODUCT_LIMITS.batchSize products per call
 * (the page sends a sheet in batches). Every row is checked on its own: the
 * category must be active, photos must be the seller's own uploads and the
 * SKU unused. Good rows are saved even when others in the batch fail, and
 * each row's result comes back so the seller can fix just those.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const sellerId = principal.sellerId;
    const db = createDatabase();
    const seller = (await db.select({ id: sellers.id, status: sellers.status }).from(sellers).where(and(eq(sellers.id, sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
    if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");
    await enforceRateLimit(db, request, "productBulk", { subject: principal.userId });

    const body = productBulkCreateSchema.parse(await request.json());
    const results: Result[] = [];
    const ready: Array<{ row: number; input: ProductDraftInput & { variant: NonNullable<ProductDraftInput["variant"]> } }> = [];
    for (const { row, product } of body.rows) {
      const parsed = productDraftSchema.safeParse(product);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        results.push({ row, ok: false, error: `${issue?.path.join(".") || "Row"}: ${issue?.message ?? "Invalid"}` });
      } else if (!parsed.data.variant) results.push({ row, ok: false, error: "Price, SKU, weight and stock are required" });
      else ready.push({ row, input: { ...parsed.data, variant: parsed.data.variant } });
    }

    const categoryIds = [...new Set(ready.map((r) => r.input.categoryId))];
    const assetIds = [...new Set(ready.flatMap((r) => r.input.imageAssetIds))];
    const skus = ready.map((r) => r.input.variant.sku);
    const [activeCategories, ownImages, takenSkus] = await Promise.all([
      categoryIds.length ? db.select({ id: categories.id }).from(categories).where(and(inArray(categories.id, categoryIds), eq(categories.isActive, true))) : [],
      assetIds.length ? db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(inArray(mediaAssets.id, assetIds), eq(mediaAssets.uploadedByUserId, principal.userId), eq(mediaAssets.kind, "IMAGE"))) : [],
      skus.length ? db.select({ sku: productVariants.sku }).from(productVariants).where(inArray(productVariants.sku, skus)) : [],
    ]);
    const categoryOk = new Set(activeCategories.map((c) => c.id));
    const imageOk = new Set(ownImages.map((a) => a.id));
    const taken = new Set(takenSkus.map((s) => s.sku));
    const seen = new Set<string>();

    for (const { row, input } of ready) {
      const sku = input.variant.sku;
      let error = "";
      if (!categoryOk.has(input.categoryId)) error = "This category isn't available any more";
      else if (input.imageAssetIds.some((id) => !imageOk.has(id))) error = "A photo wasn't uploaded from your account; upload it again";
      else if (taken.has(sku)) error = `SKU ${sku} is already used on LOIMART; use a different SKU`;
      else if (seen.has(sku)) error = `SKU ${sku} appears twice in your sheet`;
      seen.add(sku);
      if (error) { results.push({ row, ok: false, error }); continue; }
      try {
        const product = await db.transaction((tx) => insertSellerProduct(tx, sellerId, input, { submitForQc: body.submitForQc }));
        results.push({ row, ok: true, productId: product.id, status: product.status });
      } catch (err) {
        results.push({ row, ok: false, error: isUniqueViolation(err) ? `SKU ${sku} is already used on LOIMART; use a different SKU` : "Couldn't save this row; please try again" });
      }
    }

    const created = results.filter((r) => r.ok);
    if (created.length) {
      await db.insert(auditLogs).values({
        actorUserId: principal.userId, action: "PRODUCTS_BULK_CREATED", entityType: "seller", entityId: sellerId,
        metadata: { created: created.length, failed: results.length - created.length, submitForQc: body.submitForQc, productIds: created.map((r) => r.productId) },
      });
    }
    results.sort((a, b) => a.row - b.row);
    return NextResponse.json({ results });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
