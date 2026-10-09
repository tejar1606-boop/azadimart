import { requireApiAccess } from "@azadimart/auth";
import {
  auditLogs,
  createDatabase,
  sellerAadhaar,
  sellerDocuments,
  sellerVerifications,
  sellers,
} from "@azadimart/database";
import { AppError, sellerApprovalSchema, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
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

    const approved = input.decision === "APPROVED";
    const now = new Date();

    // Locks the seller row (KYC submission locks the same row), and the
    // verification update is conditional on IN_REVIEW, so concurrent admins or
    // a concurrent resubmission cannot produce a mixed decision.
    const seller = await db.transaction(async (tx) => {
      const seller = (await tx
        .select({ id: sellers.id, userId: sellers.userId, status: sellers.status, taxIdentityType: sellers.taxIdentityType })
        .from(sellers)
        .where(eq(sellers.id, input.sellerId))
        .limit(1)
        .for("update"))[0];
      if (!seller) {
        throw new AppError("NOT_FOUND", "Seller not found");
      }

      if (approved) {
        const required = ["PAN", "BANK_PROOF", "ADDRESS_PROOF", seller.taxIdentityType === "ENROLMENT_ID" ? "GST_ENROLMENT" : "GST"];
        const present = new Set((await tx
          .select({ type: sellerDocuments.type })
          .from(sellerDocuments)
          .where(eq(sellerDocuments.sellerId, seller.id))).map((row) => row.type));
        const missing = required.filter((type) => !present.has(type as typeof sellerDocuments.$inferSelect.type));
        if (missing.length) {
          throw new AppError("UNPROCESSABLE", "Seller KYC documents are missing: " + missing.join(", "));
        }
        const aadhaar = (await tx.select({ status: sellerAadhaar.status }).from(sellerAadhaar).where(eq(sellerAadhaar.sellerId, seller.id)).limit(1))[0];
        if (aadhaar?.status !== "VERIFIED") {
          throw new AppError("UNPROCESSABLE", "The owner's Aadhaar isn't verified yet; it's required for every seller");
        }
      }

      const decided = (await tx
        .update(sellerVerifications)
        .set({
          status: approved ? "APPROVED" : "REJECTED",
          notes: input.notes ?? null,
          reviewedByUserId: principal.userId,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(and(eq(sellerVerifications.sellerId, seller.id), eq(sellerVerifications.status, "IN_REVIEW")))
        .returning({ id: sellerVerifications.id }))[0];
      if (!decided) {
        throw new AppError("UNPROCESSABLE", "Seller KYC is not pending admin review");
      }

      await tx
        .update(sellers)
        .set({
          status: approved ? "ACTIVE" : "REJECTED",
          approvedAt: approved ? now : null,
          approvedByUserId: approved ? principal.userId : null,
          updatedAt: now,
        })
        .where(eq(sellers.id, seller.id));

      await tx.insert(auditLogs).values({
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

      return seller;
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
