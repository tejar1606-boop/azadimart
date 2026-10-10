import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, productAplusContent } from "@azadimart/database";
import { AppError, aplusBlocksSchema, aplusDecisionSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Approve (publish the draft) or reject (with notes) submitted A+ content. */
export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { productId } = await params;
    if (!uuidSchema.safeParse(productId).success) throw new AppError("NOT_FOUND", "A+ content not found");
    const input = aplusDecisionSchema.parse(await request.json());
    if (input.decision === "REJECTED" && !input.notes) throw new AppError("VALIDATION_ERROR", "Tell the seller what to change");
    const db = createDatabase();
    const result = await db.transaction(async (tx) => {
      const row = (await tx.select().from(productAplusContent)
        .where(and(eq(productAplusContent.productId, productId), eq(productAplusContent.status, "PENDING_REVIEW"))).limit(1).for("update"))[0];
      if (!row) throw new AppError("CONFLICT", "This A+ content is not waiting for review");
      const now = new Date();
      const approved = input.decision === "APPROVED";
      // Publish exactly what was reviewed, re-validated.
      const blocks = approved ? aplusBlocksSchema.parse(row.draftBlocks) : undefined;
      await tx.update(productAplusContent).set({
        status: approved ? "APPROVED" : "REJECTED",
        ...(blocks ? { blocks } : {}),
        reviewNotes: input.notes ?? null,
        reviewedAt: now,
        reviewedByUserId: principal.userId,
        updatedAt: now,
      }).where(eq(productAplusContent.id, row.id));
      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: approved ? "APLUS_APPROVED" : "APLUS_REJECTED",
        entityType: "product",
        entityId: productId,
        metadata: { notes: input.notes ?? null, blockCount: (row.draftBlocks as unknown[]).length },
      });
      return { status: approved ? "APPROVED" : "REJECTED" };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
