import { requireApiAccess } from "@azadimart/auth";
import {
  createDatabase,
  sellerAadhaar,
  sellerDocuments,
  sellerVerifications,
  sellers,
  users,
  mediaAssets,
} from "@azadimart/database";
import { AppError, maskAadhaar, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ sellerId: string }> },
) {
  const requestId = crypto.randomUUID();

  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { sellerId } = await context.params;

    if (!uuidSchema.safeParse(sellerId).success) {
      throw new AppError("VALIDATION_ERROR", "Invalid seller ID");
    }

    const db = createDatabase();
    const sellerRows = await db
      .select({
        id: sellers.id,
        storeName: sellers.storeName,
        legalName: sellers.legalName,
        taxIdentityType: sellers.taxIdentityType,
        gstin: sellers.gstin,
        gstEnrolmentId: sellers.gstEnrolmentId,
        businessState: sellers.businessState,
        taxDeclarationAcceptedAt: sellers.taxDeclarationAcceptedAt,
        pan: sellers.pan,
        status: sellers.status,
        approvedAt: sellers.approvedAt,
        createdAt: sellers.createdAt,
        email: users.email,
        phone: users.phone,
      })
      .from(sellers)
      .innerJoin(users, eq(users.id, sellers.userId))
      .where(eq(sellers.id, sellerId))
      .limit(1);

    const seller = sellerRows[0];
    if (!seller) {
      throw new AppError("NOT_FOUND", "Seller not found");
    }

    const verificationRows = await db
      .select({
        id: sellerVerifications.id,
        status: sellerVerifications.status,
        notes: sellerVerifications.notes,
        reviewedAt: sellerVerifications.reviewedAt,
        reviewedByUserId: sellerVerifications.reviewedByUserId,
      })
      .from(sellerVerifications)
      .where(eq(sellerVerifications.sellerId, sellerId))
      .limit(1);

    const documents = await db
      .select({
        id: sellerDocuments.id,
        type: sellerDocuments.type,
        mediaAssetId: sellerDocuments.mediaAssetId,
        fileName: mediaAssets.storageKey,
        mimeType: mediaAssets.mimeType,
        byteSize: mediaAssets.byteSize,
        uploadedAt: mediaAssets.createdAt,
      })
      .from(sellerDocuments)
      .innerJoin(mediaAssets, eq(mediaAssets.id, sellerDocuments.mediaAssetId))
      .where(eq(sellerDocuments.sellerId, sellerId));

    // Only the masked number and the provider's details are kept, never the Aadhaar number.
    const aadhaar = (await db.select().from(sellerAadhaar).where(eq(sellerAadhaar.sellerId, sellerId)).limit(1))[0];

    return NextResponse.json({
      seller,
      verification: verificationRows[0] ?? null,
      documents,
      aadhaar: aadhaar ? {
        status: aadhaar.status,
        masked: maskAadhaar(aadhaar.last4),
        nameOnAadhaar: aadhaar.nameOnAadhaar,
        yearOfBirth: aadhaar.yearOfBirth,
        state: aadhaar.stateOnAadhaar,
        verifiedAt: aadhaar.verifiedAt,
        consentAt: aadhaar.consentAt,
        testMode: aadhaar.provider === "sandbox",
      } : null,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
