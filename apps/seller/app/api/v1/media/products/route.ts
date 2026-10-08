import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, mediaAssets, sellers } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { assertUploadsAvailable, getObjectStore } from "@azadimart/storage";
import { NextResponse } from "next/server";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

type Detected = { mimeType: string; extension: "jpg" | "png" | "webp" | "mp4" | "webm" };

function detect(bytes: Uint8Array, mime: string): Detected | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mimeType: "image/png", extension: "png" };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return { mimeType: "image/webp", extension: "webp" };
  // Videos are checked by signature too, not just the client-declared type.
  if (mime === "video/mp4" && bytes.length >= 12 && String.fromCharCode(...bytes.slice(4,8)) === "ftyp") return { mimeType: "video/mp4", extension: "mp4" };
  if (mime === "video/webm" && bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { mimeType: "video/webm", extension: "webm" };
  return null;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    try { assertUploadsAvailable(); } catch { throw new AppError("UNPROCESSABLE", "File uploads are unavailable: object storage is not configured."); }
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const db = createDatabase();
    const seller = (await db.select({ id: sellers.id, status: sellers.status }).from(sellers).where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
    if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");

    const formData = await request.formData().catch(() => { throw new AppError("VALIDATION_ERROR", "Upload must be multipart/form-data"); });
    const value = formData.get("file");
    if (!(value instanceof File)) throw new AppError("VALIDATION_ERROR", "A media file is required");
    const declaredKind = formData.get("kind");
    if (declaredKind !== "IMAGE" && declaredKind !== "VIDEO") throw new AppError("VALIDATION_ERROR", "Media kind must be IMAGE or VIDEO");
    const maxBytes = declaredKind === "IMAGE" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (value.size <= 0 || value.size > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", declaredKind === "IMAGE" ? "Image must be between 1 byte and 15 MB" : "Video must be between 1 byte and 100 MB");

    const bytes = new Uint8Array(await value.arrayBuffer());
    const detected = detect(bytes, value.type);
    if (!detected) throw new AppError("VALIDATION_ERROR", "Unsupported product media format");
    if (declaredKind === "IMAGE" && !detected.mimeType.startsWith("image/")) throw new AppError("VALIDATION_ERROR", "Selected file is not an image");
    if (declaredKind === "VIDEO" && !detected.mimeType.startsWith("video/")) throw new AppError("VALIDATION_ERROR", "Selected file is not a video");

    const fileId = crypto.randomUUID();
    const storageKey = `product-media/${seller.id}/${fileId}.${detected.extension}`;
    const store = getObjectStore();
    await store.put(storageKey, bytes, detected.mimeType);

    try {
      const asset = (await db.insert(mediaAssets).values({
        kind: declaredKind,
        storageKey,
        mimeType: detected.mimeType,
        byteSize: value.size,
        uploadedByUserId: principal.userId,
      }).returning({ id: mediaAssets.id }))[0];
      if (!asset) throw new AppError("INTERNAL", "Media record creation failed", undefined, false);
      return NextResponse.json({ ok: true, mediaAssetId: asset.id, fileName: value.name, mimeType: detected.mimeType, byteSize: value.size }, { status: 201 });
    } catch (error) {
      await store.delete(storageKey).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
