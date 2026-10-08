import { requireApiAccess } from "@azadimart/auth";
import {
  createDatabase,
  mediaAssets,
  sellerDocuments,
  sellerVerifications,
  sellers,
} from "@azadimart/database";
import {
  AppError,
  sellerKycSubmissionSchema,
  toApiError,
} from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) {
      throw new AppError("FORBIDDEN", "Seller profile is required");
    }

    const input = sellerKycSubmissionSchema.parse(await request.json());
    const db = createDatabase();

    const sellerRows = await db
      .select({ id: sellers.id, status: sellers.status })
      .from(sellers)
      .where(eq(sellers.id, principal.sellerId))
      .limit(1);

    const seller = sellerRows[0];
    if (!seller) {
      throw new AppError("NOT_FOUND", "Seller profile not found");
    }

    if (["ACTIVE", "SUSPENDED"].includes(seller.status)) {
      throw new AppError("FORBIDDEN", "KYC cannot be changed for the current seller status");
    }

    const assetIds = input.documents.map((document) => document.mediaAssetId);
    const assets = await db
      .select({
        id: mediaAssets.id,
        kind: mediaAssets.kind,
        uploadedByUserId: mediaAssets.uploadedByUserId,
      })
      .from(mediaAssets)
      .where(
        and(
          inArray(mediaAssets.id, assetIds),
          eq(mediaAssets.uploadedByUserId, principal.userId),
        ),
      );

    if (assets.length !== assetIds.length) {
      throw new AppError("FORBIDDEN", "One or more KYC documents are not owned by this seller");
    }

    if (assets.some((asset) => asset.kind !== "DOCUMENT")) {
      throw new AppError("VALIDATION_ERROR", "All KYC assets must be document media");
    }

    const now = new Date();
    await db.delete(sellerDocuments).where(eq(sellerDocuments.sellerId, principal.sellerId));
    await db.insert(sellerDocuments).values(
      input.documents.map((document) => ({
        sellerId: principal.sellerId!,
        type: document.type,
        mediaAssetId: document.mediaAssetId,
      })),
    );

    const verificationRows = await db
      .select({ id: sellerVerifications.id })
      .from(sellerVerifications)
      .where(eq(sellerVerifications.sellerId, principal.sellerId))
      .limit(1);

    if (verificationRows[0]) {
      await db
        .update(sellerVerifications)
        .set({
          status: "IN_REVIEW",
          reviewedByUserId: null,
          reviewedAt: null,
          notes: null,
          updatedAt: now,
        })
        .where(eq(sellerVerifications.id, verificationRows[0].id));
    } else {
      await db.insert(sellerVerifications).values({
        sellerId: principal.sellerId,
        status: "IN_REVIEW",
      });
    }

    await db
      .update(sellers)
      .set({ status: "KYC_SUBMITTED", updatedAt: now })
      .where(eq(sellers.id, principal.sellerId));

    return NextResponse.json({
      ok: true,
      sellerId: principal.sellerId,
      status: "KYC_SUBMITTED",
      documentCount: input.documents.length,
      message: "KYC submitted for admin review.",
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
