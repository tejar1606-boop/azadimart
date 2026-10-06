import { requireApiAccess } from "@azadimart/auth";
import {
  createDatabase,
  sellerDocuments,
  sellerVerifications,
  sellers,
  users,
  mediaAssets,
} from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
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
        gstin: sellers.gstin,
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

    return NextResponse.json({
      seller,
      verification: verificationRows[0] ?? null,
      documents,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
