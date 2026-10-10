import { requireApiAccess, enforceRateLimit } from "@azadimart/auth";
import { createDatabase, mediaAssets, sellers } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { assertUploadsAvailable, getObjectStore } from "@azadimart/storage";
import { NextResponse } from "next/server";

const MAX_BYTES = 10 * 1024 * 1024;

type DetectedFile = { mimeType: string; extension: "pdf" | "jpg" | "png" | "webp" };

function detectFile(bytes: Uint8Array): DetectedFile | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") {
    return { mimeType: "application/pdf", extension: "pdf" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return null;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    try {
      assertUploadsAvailable();
    } catch {
      throw new AppError(
        "UNPROCESSABLE",
        "File uploads are unavailable: object storage is not configured.",
      );
    }

    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) {
      throw new AppError("FORBIDDEN", "Seller profile is required");
    }

    const db = createDatabase();
    await enforceRateLimit(db, request, "upload", { subject: principal.userId });
    const sellerRows = await db
      .select({ id: sellers.id, status: sellers.status })
      .from(sellers)
      .where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId)))
      .limit(1);

    const seller = sellerRows[0];
    if (!seller) {
      throw new AppError("NOT_FOUND", "Seller profile not found");
    }

    if (["ACTIVE", "SUSPENDED"].includes(seller.status)) {
      throw new AppError("FORBIDDEN", "Document upload is not allowed for the current seller status");
    }

    const formData = await request.formData().catch(() => {
      throw new AppError("VALIDATION_ERROR", "Upload must be multipart/form-data");
    });
    const value = formData.get("file");
    if (!(value instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "A document file is required");
    }

    if (value.size <= 0 || value.size > MAX_BYTES) {
      throw new AppError("PAYLOAD_TOO_LARGE", "Document must be between 1 byte and 10 MB");
    }

    const bytes = new Uint8Array(await value.arrayBuffer());
    const detected = detectFile(bytes);
    if (!detected) {
      throw new AppError("VALIDATION_ERROR", "Only PDF, JPG, PNG, and WebP documents are supported");
    }

    const fileId = crypto.randomUUID();
    const storageKey = `private-documents/${seller.id}/${fileId}.${detected.extension}`;
    const store = getObjectStore();
    await store.put(storageKey, bytes, detected.mimeType);

    try {
      const rows = await db
        .insert(mediaAssets)
        .values({
          kind: "DOCUMENT",
          storageKey,
          mimeType: detected.mimeType,
          byteSize: value.size,
          uploadedByUserId: principal.userId,
        })
        .returning({ id: mediaAssets.id });

      const asset = rows[0];
      if (!asset) {
        throw new AppError("INTERNAL", "Document record creation failed", undefined, false);
      }

      return NextResponse.json(
        {
          ok: true,
          mediaAssetId: asset.id,
          fileName: value.name,
          mimeType: detected.mimeType,
          byteSize: value.size,
        },
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
