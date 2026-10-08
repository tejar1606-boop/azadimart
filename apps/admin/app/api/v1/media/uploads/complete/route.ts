import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, mediaAssets } from "@azadimart/database";
import { AppError, mediaUploadCompleteSchema, toApiError } from "@azadimart/shared";
import { finalizeUpload, getObjectStore, UploadError } from "@azadimart/storage";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";


/** Step 3 of a direct upload: verifies the stored file and records it. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = mediaUploadCompleteSchema.parse(await request.json());
    const store = getObjectStore();
    const upload = await finalizeUpload(store, { token: input.token, userId: principal.userId, allowedPurposes: ["SITE_IMAGE", "SITE_VIDEO"], keyPrefix: "site-media" });

    const db = createDatabase();
    const asset = await db.transaction(async (tx) => {
      const row = (await tx.insert(mediaAssets).values({
        kind: upload.detected.kind,
        storageKey: upload.key,
        mimeType: upload.detected.mimeType,
        byteSize: upload.byteSize,
        altText: input.altText ?? null,
        uploadedByUserId: principal.userId,
      }).onConflictDoNothing({ target: mediaAssets.storageKey }).returning({ id: mediaAssets.id }))[0]
        ?? (await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.storageKey, upload.key)).limit(1))[0];
      if (!row) throw new AppError("INTERNAL", "Media record creation failed", undefined, false);
      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: "SITE_MEDIA_UPLOADED",
        entityType: "media_asset",
        entityId: row.id,
        metadata: { storageKey: upload.key, mimeType: upload.detected.mimeType, byteSize: upload.byteSize, width: upload.width ?? null, height: upload.height ?? null },
      });
      return row;
    });

    return NextResponse.json({
      ok: true,
      mediaAssetId: asset.id,
      kind: upload.detected.kind,
      mimeType: upload.detected.mimeType,
      byteSize: upload.byteSize,
      width: upload.width,
      height: upload.height,
      url: "/media/" + upload.key,
    }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error instanceof UploadError ? new AppError(error.status === 413 ? "PAYLOAD_TOO_LARGE" : error.status === 403 ? "FORBIDDEN" : "VALIDATION_ERROR", error.message) : error, requestId);
    return NextResponse.json(body, { status });
  }
}

