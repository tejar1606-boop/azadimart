import { mediaAssets, createDatabase } from "@azadimart/database";
import { getObjectStore, isValidStorageKey } from "@azadimart/storage";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

// Public product media only. KYC documents (kind DOCUMENT, private-documents/)
// are never served here; admins fetch them through an authenticated API.
const PUBLIC_PREFIX = "product-media/";
const MIME = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: segments } = await params;
    const storageKey = segments.join("/");
    if (!storageKey.startsWith(PUBLIC_PREFIX) || !isValidStorageKey(storageKey)) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const db = createDatabase();
    const asset = (await db
      .select({ mimeType: mediaAssets.mimeType })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.storageKey, storageKey), inArray(mediaAssets.kind, ["IMAGE", "VIDEO"])))
      .limit(1))[0];
    if (!asset || !MIME.has(asset.mimeType)) return new NextResponse("Not Found", { status: 404 });

    const bytes = await getObjectStore().get(storageKey);
    if (!bytes) return new NextResponse("Not Found", { status: 404 });

    return new NextResponse(bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        // Keys are immutable (random UUID per upload).
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
