import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { detectMedia, type DetectedMedia, imageDimensions, isSquare } from "./media";
import type { ObjectStore } from "./object-store";

/**
 * Direct uploads: the browser sends the file straight to object storage with a
 * signed URL (no app server in the data path, so no request-size limit), then
 * the app verifies the stored bytes before recording them.
 *
 *   1. createUpload()   -> key + signed token + where to PUT the file
 *   2. browser PUTs the file
 *   3. finalizeUpload() -> checks token, size, real file type and image rules
 */

export type UploadPurpose = "SITE_IMAGE" | "SITE_VIDEO" | "PRODUCT_IMAGE" | "PRODUCT_VIDEO";

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

type PurposeRule = {
  kind: "IMAGE" | "VIDEO";
  maxBytes: number;
  contentTypes: string[];
  square?: { minPx: number };
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

// Videos: no app limit beyond the single-upload maximum of S3/R2 (5 GB).
export const UPLOAD_RULES: Record<UploadPurpose, PurposeRule> = {
  SITE_IMAGE: { kind: "IMAGE", maxBytes: 50 * MB, contentTypes: IMAGE_TYPES },
  SITE_VIDEO: { kind: "VIDEO", maxBytes: 5 * GB, contentTypes: VIDEO_TYPES },
  PRODUCT_IMAGE: { kind: "IMAGE", maxBytes: 50 * MB, contentTypes: IMAGE_TYPES, square: { minPx: 500 } },
  PRODUCT_VIDEO: { kind: "VIDEO", maxBytes: 5 * GB, contentTypes: VIDEO_TYPES },
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

export class UploadError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 413 = 400) {
    super(message);
    this.name = "UploadError";
  }
}

let devSecret: string | undefined;
function secret(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured && configured.length >= 16 && !configured.startsWith("replace-with")) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set to sign uploads");
  devSecret ??= randomBytes(32).toString("hex");
  return devSecret;
}

type TokenClaims = { key: string; userId: string; purpose: UploadPurpose; contentType: string; exp: number };

function sign(claims: TokenClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(payload).digest("base64url");
  return payload + "." + mac;
}

export function verifyUploadToken(token: string, userId: string): TokenClaims {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) throw new UploadError("Invalid upload token", 403);
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UploadError("Invalid upload token", 403);
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenClaims;
  if (claims.userId !== userId) throw new UploadError("Upload belongs to another user", 403);
  if (claims.exp < Date.now()) throw new UploadError("Upload session expired; please try again", 403);
  return claims;
}

export async function createUpload(
  store: ObjectStore,
  input: { purpose: UploadPurpose; keyPrefix: string; userId: string; contentType: string; byteSize: number; localUploadPath: string },
): Promise<{ key: string; token: string; uploadUrl: string; method: "PUT"; headers: Record<string, string>; maxBytes: number }> {
  const rule = UPLOAD_RULES[input.purpose];
  if (!rule.contentTypes.includes(input.contentType)) {
    throw new UploadError(rule.kind === "IMAGE" ? "Upload a JPG, PNG or WebP image" : "Upload an MP4, WebM or MOV video");
  }
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) throw new UploadError("File is empty");
  if (input.byteSize > rule.maxBytes) throw new UploadError(`File is larger than ${Math.round(rule.maxBytes / MB).toLocaleString("en-IN")} MB`, 413);

  const key = `${input.keyPrefix}/${crypto.randomUUID()}.${EXTENSIONS[input.contentType]}`;
  const token = sign({ key, userId: input.userId, purpose: input.purpose, contentType: input.contentType, exp: Date.now() + 2 * 60 * 60 * 1000 });
  const signed = await store.createUploadUrl(key, input.contentType, 2 * 60 * 60);
  return {
    key,
    token,
    method: "PUT",
    uploadUrl: signed ?? `${input.localUploadPath}?token=${encodeURIComponent(token)}`,
    headers: { "Content-Type": input.contentType },
    maxBytes: rule.maxBytes,
  };
}

/** Local driver only: receive the PUT body for a signed upload. */
export async function receiveLocalUpload(store: ObjectStore, token: string, userId: string, body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (store.driver !== "local") throw new UploadError("Upload directly to storage with the signed URL", 400);
  const claims = verifyUploadToken(token, userId);
  if (!body) throw new UploadError("File is empty");
  try {
    await store.writeStream(claims.key, body, UPLOAD_RULES[claims.purpose].maxBytes);
  } catch (error) {
    if (error instanceof Error && error.message === "UPLOAD_TOO_LARGE") throw new UploadError("File is too large", 413);
    throw error;
  }
}

/** Verify what actually landed in storage; deletes the object if it fails any rule. */
export async function finalizeUpload(
  store: ObjectStore,
  input: { token: string; userId: string; allowedPurposes: UploadPurpose[]; keyPrefix: string },
): Promise<{ key: string; purpose: UploadPurpose; detected: DetectedMedia; byteSize: number; width?: number; height?: number }> {
  const claims = verifyUploadToken(input.token, input.userId);
  if (!input.allowedPurposes.includes(claims.purpose) || !claims.key.startsWith(input.keyPrefix + "/")) {
    throw new UploadError("Upload is not allowed here", 403);
  }
  const rule = UPLOAD_RULES[claims.purpose];
  const reject = async (message: string, status: 400 | 413 = 400): Promise<never> => {
    await store.delete(claims.key).catch(() => undefined);
    throw new UploadError(message, status);
  };

  const head = await store.head(claims.key);
  if (!head) throw new UploadError("Upload not found; please upload the file again");
  if (head.size === 0) return reject("File is empty");
  if (head.size > rule.maxBytes) return reject("File is too large", 413);

  // Enough to identify the format and, for images, find the pixel size
  // (JPEG frame headers can follow large EXIF blocks).
  const sample = await store.getRange(claims.key, 0, Math.min(head.size, 512 * 1024) - 1);
  const detected = sample ? detectMedia(sample) : null;
  if (!detected || detected.kind !== rule.kind) {
    return reject(rule.kind === "IMAGE" ? "This file is not a JPG, PNG or WebP image" : "This file is not an MP4, WebM or MOV video");
  }

  let size: { width: number; height: number } | null = null;
  if (rule.kind === "IMAGE") {
    size = imageDimensions(sample!);
    if (!size) return reject("Could not read the image size");
    if (rule.square) {
      if (!isSquare(size)) return reject(`Product images must be square (1:1). This image is ${size.width} × ${size.height}; use 1000 × 1000 or larger.`);
      if (size.width < rule.square.minPx) return reject(`Product images must be at least ${rule.square.minPx} × ${rule.square.minPx}; 1000 × 1000 or larger is recommended.`);
    }
  }

  return { key: claims.key, purpose: claims.purpose, detected, byteSize: head.size, ...(size ?? {}) };
}

/**
 * Serve a public media object without loading it into memory: videos on S3/R2
 * redirect to a short-lived signed URL (the bucket handles Range requests),
 * everything else is streamed with Range support.
 */
export async function serveStoredMedia(store: ObjectStore, key: string, mimeType: string, rangeHeader: string | null): Promise<Response> {
  if (mimeType.startsWith("video/")) {
    const signed = await store.createDownloadUrl(key, 60 * 60);
    if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, max-age=600" } });
  }
  const head = await store.head(key);
  if (!head) return new Response("Not Found", { status: 404 });
  const size = head.size;
  const headers = new Headers({
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (match && (match[1] || match[2])) {
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    // Cap a single response so huge local videos are served in chunks.
    end = Math.min(end, start + 8 * MB - 1);
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  const bytes = await store.getRange(key, start, end);
  if (!bytes) return new Response("Not Found", { status: 404 });
  headers.set("Content-Length", String(bytes.length));
  return new Response(bytes as BodyInit, { status, headers });
}
