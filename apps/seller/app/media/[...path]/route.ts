import { mediaAssets, createDatabase } from "@azadimart/database";
import { getObjectStore, isValidStorageKey, serveStoredMedia } from "@azadimart/storage";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

// Public media only: seller product media and admin-uploaded site media.
// KYC documents (kind DOCUMENT, private-documents/) are never served here;
// admins fetch them through an authenticated API.
const PUBLIC_PREFIXES = ["product-media/", "site-media/"];
const MIME = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"]);

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: segments } = await params;
    const storageKey = segments.join("/");
    if (!PUBLIC_PREFIXES.some((prefix) => storageKey.startsWith(prefix)) || !isValidStorageKey(storageKey)) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const db = createDatabase();
    const asset = (await db
      .select({ mimeType: mediaAssets.mimeType })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.storageKey, storageKey), inArray(mediaAssets.kind, ["IMAGE", "VIDEO"])))
      .limit(1))[0];
    if (!asset || !MIME.has(asset.mimeType)) return new NextResponse("Not Found", { status: 404 });

    // Streams with Range support (videos on S3/R2 redirect to a signed URL),
    // so large files are never loaded into memory.
    return await serveStoredMedia(getObjectStore(), storageKey, asset.mimeType, request.headers.get("range"));
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
