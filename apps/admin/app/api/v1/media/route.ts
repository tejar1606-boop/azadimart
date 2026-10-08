import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, mediaAssets } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { assertUploadsAvailable, detectMedia, getObjectStore, MEDIA_LIMITS } from "@azadimart/storage";
import { NextResponse } from "next/server";

/**
 * Upload a public storefront image or video (homepage banners, videos).
 * Stored under site-media/ and served by the storefront at /media/<key>.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    try {
      assertUploadsAvailable();
    } catch {
      throw new AppError("UNPROCESSABLE", "File uploads are unavailable: object storage is not configured.");
    }

    const formData = await request.formData().catch(() => {
      throw new AppError("VALIDATION_ERROR", "Upload must be multipart/form-data");
    });
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION_ERROR", "Choose a file to upload");
    if (file.size > MEDIA_LIMITS.VIDEO) throw new AppError("PAYLOAD_TOO_LARGE", "Files must be 100 MB or smaller");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectMedia(bytes);
    if (!detected) throw new AppError("VALIDATION_ERROR", "Upload a JPG, PNG or WebP image, or an MP4 or WebM video");
    if (bytes.length > MEDIA_LIMITS[detected.kind]) {
      throw new AppError("PAYLOAD_TOO_LARGE", detected.kind === "IMAGE" ? "Images must be 15 MB or smaller" : "Videos must be 100 MB or smaller");
    }

    const storageKey = `site-media/${crypto.randomUUID()}.${detected.extension}`;
    const store = getObjectStore();
    await store.put(storageKey, bytes, detected.mimeType);

    const db = createDatabase();
    try {
      const asset = await db.transaction(async (tx) => {
        const row = (await tx.insert(mediaAssets).values({
          kind: detected.kind,
          storageKey,
          mimeType: detected.mimeType,
          byteSize: bytes.length,
          altText: typeof formData.get("altText") === "string" ? String(formData.get("altText")).slice(0, 300) || null : null,
          uploadedByUserId: principal.userId,
        }).returning({ id: mediaAssets.id }))[0];
        if (!row) throw new AppError("INTERNAL", "Media record creation failed", undefined, false);
        await tx.insert(auditLogs).values({
          actorUserId: principal.userId,
          action: "SITE_MEDIA_UPLOADED",
          entityType: "media_asset",
          entityId: row.id,
          metadata: { storageKey, mimeType: detected.mimeType, byteSize: bytes.length, fileName: file.name.slice(0, 200) },
        });
        return row;
      });
      return NextResponse.json(
        { ok: true, mediaAssetId: asset.id, kind: detected.kind, mimeType: detected.mimeType, byteSize: bytes.length, url: "/media/" + storageKey },
        { status: 201 },
      );
    } catch (error) {
      await store.delete(storageKey).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
