import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, inventory, inventoryMovements, productVariants, products, sellers } from "@azadimart/database";
import { AppError, productBulkStockSchema, productStockUpdateSchema, toApiError } from "@azadimart/shared";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

async function activeSeller(request: Request) {
  const principal = await requireApiAccess(request, "seller", ["SELLER"]);
  if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
  const db = createDatabase();
  const seller = (await db.select({ id: sellers.id, status: sellers.status }).from(sellers).where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
  if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");
  return { db, principal, sellerId: seller.id };
}

/** Every SKU with its current stock, for the "Update stock" sheet. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, sellerId } = await activeSeller(request);
    const items = await db.select({ variantId: productVariants.id, productId: products.id, sku: productVariants.sku, title: products.title, variant: productVariants.title, status: products.status, pricePaise: productVariants.pricePaise, onHand: inventory.onHand, reserved: inventory.reserved })
      .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).innerJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(products.sellerId, sellerId), inArray(products.status, ["DRAFT", "PENDING_QC", "PENDING_ADMIN_APPROVAL", "QC_REJECTED", "LIVE", "UNLISTED"])))
      .orderBy(asc(products.title), asc(productVariants.sku));
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Sets stock by SKU for the seller's own products. Applies straight away (no QC), like editing stock on a product. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, principal, sellerId } = await activeSeller(request);
    const { items } = productBulkStockSchema.parse(await request.json());
    const bySku = new Map(items.map((i) => [i.sku, i.onHand]));
    const variants = await db.select({ variantId: productVariants.id, sku: productVariants.sku, onHand: inventory.onHand })
      .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).innerJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(products.sellerId, sellerId), inArray(productVariants.sku, [...bySku.keys()])));
    const changed = variants.filter((v) => v.onHand !== bySku.get(v.sku));
    if (changed.length) {
      await db.transaction(async (tx) => {
        for (const v of changed) await tx.update(inventory).set({ onHand: bySku.get(v.sku)!, updatedAt: new Date() }).where(and(eq(inventory.variantId, v.variantId), eq(inventory.sellerId, sellerId)));
        await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "STOCK_BULK_UPDATED", entityType: "seller", entityId: sellerId, metadata: { updated: changed.length, skus: changed.map((v) => v.sku).slice(0, 200) } });
      });
    }
    const found = new Set(variants.map((v) => v.sku));
    return NextResponse.json({ updated: changed.length, unchanged: variants.length - changed.length, notFound: [...bySku.keys()].filter((sku) => !found.has(sku)) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}


/**
 * Update stock for one SKU, e.g. when it has run out: the seller enters how
 * many units are ready to sell; units held for open orders are kept on top.
 * Applies straight away and is logged as a stock adjustment.
 */
export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, principal, sellerId } = await activeSeller(request);
    const input = productStockUpdateSchema.parse(await request.json());
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select({ onHand: inventory.onHand, reserved: inventory.reserved, sku: productVariants.sku, title: products.title })
        .from(inventory).innerJoin(productVariants, eq(productVariants.id, inventory.variantId)).innerJoin(products, eq(products.id, productVariants.productId))
        .where(and(eq(inventory.variantId, input.variantId), eq(inventory.sellerId, sellerId), eq(products.sellerId, sellerId), ne(products.status, "ARCHIVED"))).for("update");
      if (!row) throw new AppError("NOT_FOUND", "Product not found");
      const onHand = input.available + row.reserved;
      const delta = onHand - row.onHand;
      if (delta !== 0) {
        await tx.update(inventory).set({ onHand: sql`${onHand}`, updatedAt: new Date() }).where(and(eq(inventory.variantId, input.variantId), eq(inventory.sellerId, sellerId)));
        await tx.insert(inventoryMovements).values({ variantId: input.variantId, movementType: "ADJUSTMENT", quantity: delta, referenceType: "SELLER_STOCK_UPDATE", notes: `Stock set to ${input.available} available`, createdByUserId: principal.userId });
        await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "STOCK_UPDATED", entityType: "product_variant", entityId: input.variantId, metadata: { sellerId, sku: row.sku, from: Math.max(0, row.onHand - row.reserved), to: input.available } });
      }
      return { variantId: input.variantId, sku: row.sku, onHand, reserved: row.reserved, available: input.available, changed: delta !== 0 };
    });
    return NextResponse.json(result);
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
