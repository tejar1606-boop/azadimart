import { requireApiAccess } from "@azadimart/auth";
import {
  auditLogs,
  createDatabase,
  sellerDocuments,
  sellerVerifications,
  sellers,
} from "@azadimart/database";
import { AppError, sellerApprovalSchema, toApiError } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(
      request,
      "admin",
      ["ADMIN", "SUPER_ADMIN"],
    );
    const input = sellerApprovalSchema.parse(await request.json());
    const db = createDatabase();

    const sellerRows = await db
      .select({
        id: sellers.id,
        userId: sellers.userId,
        status: sellers.status,
      })
      .from(sellers)
      .where(eq(sellers.id, input.sellerId))
      .limit(1);

    const seller = sellerRows[0];
    if (!seller) {
      throw new AppError("NOT_FOUND", "Seller not found");
    }

    const verificationRows = await db
      .select({
        id: sellerVerifications.id,
        status: sellerVerifications.status,
      })
      .from(sellerVerifications)
      .where(eq(sellerVerifications.sellerId, seller.id))
      .limit(1);

    const verification = verificationRows[0];
    if (!verification || verification.status !== "IN_REVIEW") {
      throw new AppError("UNPROCESSABLE", "Seller KYC is not pending admin review");
    }

    const documentRows = await db
      .select({ id: sellerDocuments.id })
      .from(sellerDocuments)
      .where(eq(sellerDocuments.sellerId, seller.id))
      .limit(1);

    if (!documentRows[0]) {
      throw new AppError("UNPROCESSABLE", "Seller KYC documents are required before approval");
    }

    const now = new Date();
    const approved = input.decision === "APPROVED";

    await db
      .update(sellerVerifications)
      .set({
        status: approved ? "APPROVED" : "REJECTED",
        notes: input.notes ?? null,
        reviewedByUserId: principal.userId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(sellerVerifications.id, verification.id));

    await db
      .update(sellers)
      .set({
        status: approved ? "ACTIVE" : "REJECTED",
        approvedAt: approved ? now : null,
        approvedByUserId: approved ? principal.userId : null,
        updatedAt: now,
      })
      .where(eq(sellers.id, seller.id));

    await db.insert(auditLogs).values({
      actorUserId: principal.userId,
      action: approved ? "SELLER_APPROVED" : "SELLER_REJECTED",
      entityType: "seller",
      entityId: seller.id,
      metadata: {
        sellerUserId: seller.userId,
        previousStatus: seller.status,
        decision: input.decision,
        notes: input.notes ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      sellerId: seller.id,
      status: approved ? "ACTIVE" : "REJECTED",
      decision: input.decision,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
