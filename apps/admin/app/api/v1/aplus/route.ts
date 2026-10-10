import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, productAplusContent, productSummaries, products, sellers } from "@azadimart/database";
import { type AplusBlock, aplusComparedProductIds, toApiError } from "@azadimart/shared";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** A+ content waiting for review, oldest first. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    const rows = await db.select({
      productId: productAplusContent.productId,
      draftBlocks: productAplusContent.draftBlocks,
      publishedBlocks: productAplusContent.blocks,
      submittedAt: productAplusContent.submittedAt,
      productTitle: products.title,
      productStatus: products.status,
      sellerName: sellers.storeName,
    }).from(productAplusContent)
      .innerJoin(products, eq(products.id, productAplusContent.productId))
      .innerJoin(sellers, eq(sellers.id, products.sellerId))
      .where(eq(productAplusContent.status, "PENDING_REVIEW"))
      .orderBy(asc(productAplusContent.submittedAt))
      .limit(100);
    const ids = [...new Set(rows.flatMap((row) => [row.productId, ...aplusComparedProductIds(row.draftBlocks as AplusBlock[])]))];
    const summaries = await productSummaries(db, ids);
    return NextResponse.json({
      items: rows.map((row) => ({ ...row, hasPublishedVersion: (row.publishedBlocks as unknown[]).length > 0, publishedBlocks: undefined })),
      summaries,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
