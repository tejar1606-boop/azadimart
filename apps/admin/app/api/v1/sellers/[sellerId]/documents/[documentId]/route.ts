import { requireApiAccess } from "@azadimart/auth";
import {
  createDatabase,
  mediaAssets,
  sellerDocuments,
} from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ sellerId: string; documentId: string }> },
) {
  const requestId = crypto.randomUUID();

  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { sellerId, documentId } = await context.params;

    if (!uuidSchema.safeParse(sellerId).success || !uuidSchema.safeParse(documentId).success) {
      throw new AppError("VALIDATION_ERROR", "Invalid document reference");
    }

    if (process.env.NODE_ENV === "production") {
      throw new AppError(
        "UNPROCESSABLE",
        "Local document download is disabled in production. Configure object storage access first.",
      );
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

    const fileName = path.basename(document.storageKey);
    const absolutePath = path.join(process.cwd(), ".data", "private-documents", sellerId, fileName);
    const bytes = await readFile(absolutePath);

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
