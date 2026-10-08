import { auditLogs, productAplusContent } from "@azadimart/database";
import { AppError, type AplusBlock, aplusBlocksSchema, toApiError } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertBlocksOwned, requireOwnedProduct } from "../shared";

/** Send the saved draft to AzadiMart for review. */
export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { productId } = await params;
    const { db, principal, product } = await requireOwnedProduct(request, productId);
    if (product.status === "ARCHIVED") throw new AppError("CONFLICT", "Archived products cannot have A+ content");
    const row = (await db.select().from(productAplusContent).where(eq(productAplusContent.productId, product.id)).limit(1))[0];
    if (!row) throw new AppError("CONFLICT", "Save your A+ content before submitting it");
    // Re-validate the stored draft so only clean content reaches review.
    const blocks = aplusBlocksSchema.parse(row.draftBlocks) as AplusBlock[];
    if (!blocks.length) throw new AppError("VALIDATION_ERROR", "Add at least one block before submitting");
    await assertBlocksOwned(db, blocks, principal, product.id);
    const updated = await db.transaction(async (tx) => {
      const result = await tx.update(productAplusContent).set({ status: "PENDING_REVIEW", submittedAt: new Date(), reviewNotes: null, updatedAt: new Date() })
        .where(and(eq(productAplusContent.productId, product.id), inArray(productAplusContent.status, ["DRAFT", "REJECTED"])))
        .returning({ id: productAplusContent.id });
      if (!result.length) throw new AppError("CONFLICT", row.status === "PENDING_REVIEW" ? "Already waiting for review" : "Save changes before submitting again");
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "APLUS_SUBMITTED", entityType: "product", entityId: product.id, metadata: { blockCount: blocks.length } });
      return result[0];
    });
    return NextResponse.json({ ok: true, status: "PENDING_REVIEW", id: updated?.id });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
