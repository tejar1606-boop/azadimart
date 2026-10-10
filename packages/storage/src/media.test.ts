import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { detectMedia, imageDimensions, isSquare, mediaResponse } from "./media";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const mp4 = new Uint8Array([0, 0, 0, 0x20, ...Array.from("ftypisom").map((c) => c.charCodeAt(0))]);

describe("detectMedia", () => {
  it("detects images and videos by signature", () => {
    expect(detectMedia(png)?.mimeType).toBe("image/png");
    expect(detectMedia(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mimeType).toBe("image/jpeg");
    expect(detectMedia(mp4)).toMatchObject({ kind: "VIDEO", mimeType: "video/mp4" });
    expect(detectMedia(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))?.mimeType).toBe("video/webm");
  });

  it("rejects anything else", () => {
    expect(detectMedia(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectMedia(new TextEncoder().encode("%PDF-1.4"))).toBeNull();
  });
});

describe("mediaResponse", () => {
  const bytes = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

  it("serves the whole object without a range", async () => {
    const response = mediaResponse(bytes, "video/mp4", null, "public");
    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect((await response.arrayBuffer()).byteLength).toBe(100);
  });

  it("answers byte ranges with 206 (required for Safari video)", async () => {
    const response = mediaResponse(bytes, "video/mp4", "bytes=10-19", "public");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 10-19/100");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(mediaResponse(bytes, "video/mp4", "bytes=90-", "public").headers.get("content-range")).toBe("bytes 90-99/100");
    expect(mediaResponse(bytes, "video/mp4", "bytes=-5", "public").headers.get("content-range")).toBe("bytes 95-99/100");
  });

  it("rejects unsatisfiable ranges", () => {
    expect(mediaResponse(bytes, "video/mp4", "bytes=200-300", "public").status).toBe(416);
  });
});


function makePng(width: number, height: number): Uint8Array {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8); header.write("IHDR", 12); header.writeUInt32BE(width, 16); header.writeUInt32BE(height, 20);
  return new Uint8Array(Buffer.concat([header, deflateSync(Buffer.alloc(1))]));
}

describe("imageDimensions", () => {
  it("reads PNG size", () => {
    expect(imageDimensions(makePng(1000, 1000))).toEqual({ width: 1000, height: 1000 });
    expect(imageDimensions(makePng(1800, 320))).toEqual({ width: 1800, height: 320 });
  });

  it("reads JPEG size from the SOF marker", () => {
    // SOI, APP0 (len 16), SOF0 with height 600 / width 800
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03]);
    expect(imageDimensions(jpeg)).toEqual({ width: 800, height: 600 });
  });

  it("checks squareness with a small tolerance", () => {
    expect(isSquare({ width: 1000, height: 1000 })).toBe(true);
    expect(isSquare({ width: 1000, height: 990 })).toBe(true);
    expect(isSquare({ width: 1000, height: 900 })).toBe(false);
  });
});
