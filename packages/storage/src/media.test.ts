import { describe, expect, it } from "vitest";
import { detectMedia, mediaResponse } from "./media";

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
