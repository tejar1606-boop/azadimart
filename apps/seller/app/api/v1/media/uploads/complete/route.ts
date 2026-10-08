import { createDatabase, mediaAssets } from "@azadimart/database";
import { AppError, mediaUploadCompleteSchema, toApiError } from "@azadimart/shared";
import { finalizeUpload, getObjectStore } from "@azadimart/storage";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireActiveSeller, toAppError } from "../active-seller";

/** Step 3 of a direct upload: verifies the stored file (type, square images) and records it. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const seller = await requireActiveSeller(request);
    const input = mediaUploadCompleteSchema.parse(await request.json());
    const upload = await finalizeUpload(getObjectStore(), {
      token: input.token,
      userId: seller.userId,
      allowedPurposes: ["PRODUCT_IMAGE", "PRODUCT_VIDEO", "APLUS_IMAGE"],
      keyPrefix: seller.keyPrefix,
    });
    const db = createDatabase();
    const asset = (await db.insert(mediaAssets).values({
      kind: upload.detected.kind,
      storageKey: upload.key,
      mimeType: upload.detected.mimeType,
      byteSize: upload.byteSize,
      altText: input.altText ?? null,
      uploadedByUserId: seller.userId,
    }).onConflictDoNothing({ target: mediaAssets.storageKey }).returning({ id: mediaAssets.id }))[0]
      ?? (await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.storageKey, upload.key)).limit(1))[0];
    if (!asset) throw new AppError("INTERNAL", "Media record creation failed", undefined, false);
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
    const { status, body } = toApiError(toAppError(error), requestId);
    return NextResponse.json(body, { status });
  }
}
