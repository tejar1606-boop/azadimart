import { mediaAssets, createDatabase } from "@azadimart/database";
import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const MIME = new Set(["image/jpeg","image/png","image/webp","video/mp4","video/webm"]);

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (process.env.NODE_ENV === "production") {
    const baseUrl = process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
    const { path: segments } = await params;
    const storageKey = segments.join("/");
    if (!baseUrl || !storageKey || storageKey.includes("..") || storageKey.startsWith("/") || storageKey.includes("\\\\")) {
      return new NextResponse("Not Found", { status: 404 });
    }
    const url = `${baseUrl}/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
    return NextResponse.redirect(url, { status: 302 });
  }
  try {
    const { path: segments } = await params;
    const storageKey = segments.join("/");
    if (!storageKey || storageKey.includes("..") || storageKey.startsWith("/") || storageKey.includes("\\")) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const db = createDatabase();
    const asset = (await db.select({ storageKey:mediaAssets.storageKey,mimeType:mediaAssets.mimeType }).from(mediaAssets).where(eq(mediaAssets.storageKey,storageKey)).limit(1))[0];
    if (!asset || !MIME.has(asset.mimeType)) return new NextResponse("Not Found", { status: 404 });

    const absolute = path.join(process.cwd(), ".data", storageKey);
    const root = path.resolve(path.join(process.cwd(), ".data"));
    if (!path.resolve(absolute).startsWith(root + path.sep)) return new NextResponse("Not Found", { status: 404 });
    const file = await readFile(absolute);
    return new NextResponse(file, { status:200, headers:{ "Content-Type":asset.mimeType, "Cache-Control":"private, max-age=3600" } });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
