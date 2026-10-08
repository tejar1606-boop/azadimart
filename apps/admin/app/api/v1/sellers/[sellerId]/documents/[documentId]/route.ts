import { requireApiAccess } from "@azadimart/auth";
import {
  auditLogs,
  createDatabase,
  mediaAssets,
  sellerDocuments,
} from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { getObjectStore } from "@azadimart/storage";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ sellerId: string; documentId: string }> },
) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { sellerId, documentId } = await context.params;

    if (!uuidSchema.safeParse(sellerId).success || !uuidSchema.safeParse(documentId).success) {
      throw new AppError("VALIDATION_ERROR", "Invalid document reference");
    }

    const db = createDatabase();
    const rows = await db
      .select({
        storageKey: mediaAssets.storageKey,
        mimeType: mediaAssets.mimeType,
        fileName: mediaAssets.storageKey,
      })
      .from(sellerDocuments)
      .innerJoin(mediaAssets, eq(mediaAssets.id, sellerDocuments.mediaAssetId))
      .where(eq(sellerDocuments.id, documentId))
      .limit(1);

    const document = rows[0];
    if (!document || !document.storageKey.startsWith(`private-documents/${sellerId}/`)) {
      throw new AppError("NOT_FOUND", "Document not found");
    }

    const fileName = document.storageKey.split("/").pop() ?? "document";
    const bytes = await getObjectStore().get(document.storageKey);
    if (!bytes) {
      throw new AppError("NOT_FOUND", "Document file is missing from storage");
    }

    // KYC documents hold PAN/bank details; record every access.
    await db.insert(auditLogs).values({
      actorUserId: principal.userId,
      action: "SELLER_DOCUMENT_VIEWED",
      entityType: "seller_document",
      entityId: documentId,
      metadata: { sellerId },
    });

    return new NextResponse(bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
