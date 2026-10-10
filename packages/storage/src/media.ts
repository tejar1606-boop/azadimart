export type DetectedMedia = {
  kind: "IMAGE" | "VIDEO";
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm" | "video/quicktime";
  extension: "jpg" | "png" | "webp" | "mp4" | "webm" | "mov";
};

export const MEDIA_LIMITS = { IMAGE: 15 * 1024 * 1024, VIDEO: 100 * 1024 * 1024 } as const;

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));

/** Identify a public image/video by its file signature, never by name or declared type. */
export function detectMedia(bytes: Uint8Array): DetectedMedia | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: "IMAGE", mimeType: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) return { kind: "IMAGE", mimeType: "image/png", extension: "png" };
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { kind: "IMAGE", mimeType: "image/webp", extension: "webp" };
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    return ascii(bytes, 8, 12) === "qt  "
      ? { kind: "VIDEO", mimeType: "video/quicktime", extension: "mov" }
      : { kind: "VIDEO", mimeType: "video/mp4", extension: "mp4" };
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { kind: "VIDEO", mimeType: "video/webm", extension: "webm" };
  return null;
}

/**
 * Response for a stored media object, honouring a single `Range: bytes=` request.
 * Safari/iOS will not play <video> unless the server answers range requests with 206.
 */
export function mediaResponse(bytes: Uint8Array, mimeType: string, rangeHeader: string | null, cacheControl: string): Response {
  const headers = new Headers({
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  });
  const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (match && (match[1] || match[2])) {
    const size = bytes.length;
    let start = match[1] ? Number(match[1]) : size - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(bytes.slice(start, end + 1) as BodyInit, { status: 206, headers });
  }
  headers.set("Content-Length", String(bytes.length));
  return new Response(bytes as BodyInit, { status: 200, headers });
}

/** Pixel size from a PNG, JPEG or WebP header (no image decoding). */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = detectMedia(bytes)?.mimeType;
  if (type === "image/png" && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (type === "image/webp" && bytes.length >= 30) {
    const chunk = ascii(bytes, 12, 16);
    if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const b = view.getUint32(21, true);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      return { width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)), height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) };
    }
    return null;
  }
  if (type === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]!;
      // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      offset += 2 + view.getUint16(offset + 2);
    }
  }
  return null;
}

/** True when width and height differ by at most `tolerance` (default 2%). */
export function isSquare(size: { width: number; height: number }, tolerance = 0.02): boolean {
  return Math.abs(size.width - size.height) / Math.max(size.width, size.height) <= tolerance;
}
