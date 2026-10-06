import { createDatabase, products, qcSubmissions, auditLogs } from "@azadimart/database";
import { requireApiAccess } from "@azadimart/auth";
import { qcDecisionSchema, toApiError } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
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
      throw new Error("QC submission not found");
    }
    if (!["PENDING", "IN_REVIEW"].includes(submission.status)) {
      throw new Error("QC submission is already finalized");
    }

    const nextProductStatus = input.decision === "APPROVED" ? "PENDING_ADMIN_APPROVAL" : "QC_REJECTED";

    await db
      .update(qcSubmissions)
      .set({
        status: input.decision,
        notes: input.notes ?? null,
        reviewedByUserId: principal.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(qcSubmissions.id, submission.id),
          inArray(qcSubmissions.status, ["PENDING", "IN_REVIEW"]),
        ),
      );

    await db
      .update(products)
      .set({ status: nextProductStatus, updatedAt: new Date() })
      .where(eq(products.id, submission.productId));

    await db.insert(auditLogs).values({
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

    return NextResponse.json({
      ok: true,
      qcSubmissionId: submission.id,
      productId: submission.productId,
      status: input.decision,
      productStatus: nextProductStatus,
    });
  } catch (error) {
    const normalizedError = error instanceof Error && error.message === "QC submission not found"
      ? new (require("@azadimart/shared").AppError)("NOT_FOUND", error.message)
      : error;
    const { status, body } = toApiError(normalizedError, requestId);
    return NextResponse.json(body, { status });
  }
}
