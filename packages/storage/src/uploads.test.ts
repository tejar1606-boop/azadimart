import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalObjectStore } from "./object-store";
import { createUpload, finalizeUpload, receiveLocalUpload, serveStoredMedia, verifyUploadToken } from "./uploads";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); bytes.set([73, 72, 68, 82], 12); view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}
const stream = (bytes: Uint8Array) => new Blob([bytes as BlobPart]).stream();
const mov = new Uint8Array([0, 0, 0, 0x14, ...new TextEncoder().encode("ftypqt  "), ...new Array(40).fill(1)]);

let dir: string;
let store: LocalObjectStore;
beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), "azm-uploads-")); store = new LocalObjectStore(dir); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

async function uploadFlow(purpose: "PRODUCT_IMAGE" | "SITE_VIDEO", contentType: string, bytes: Uint8Array, userId = "u1") {
  const ticket = await createUpload(store, { purpose, keyPrefix: "product-media/s1", userId, contentType, byteSize: bytes.length, localUploadPath: "/api/v1/media/uploads/local" });
  await receiveLocalUpload(store, ticket.token, userId, stream(bytes));
  return ticket;
}

describe("direct uploads", () => {
  it("uses the app endpoint for the local driver", async () => {
    const ticket = await createUpload(store, { purpose: "SITE_VIDEO", keyPrefix: "site-media", userId: "u1", contentType: "video/mp4", byteSize: 3 * 1024 * 1024 * 1024, localUploadPath: "/api/v1/media/uploads/local" });
    expect(ticket.uploadUrl).toMatch(/^\/api\/v1\/media\/uploads\/local\?token=/);
    expect(ticket.key).toMatch(/^site-media\/[0-9a-f-]{36}\.mp4$/);
  });

  it("accepts a square product image and records its size", async () => {
    const ticket = await uploadFlow("PRODUCT_IMAGE", "image/png", png(1000, 1000));
    const result = await finalizeUpload(store, { token: ticket.token, userId: "u1", allowedPurposes: ["PRODUCT_IMAGE"], keyPrefix: "product-media/s1" });
    expect(result).toMatchObject({ width: 1000, height: 1000, detected: { mimeType: "image/png" } });
  });

  it("rejects and deletes a non-square product image", async () => {
    const ticket = await uploadFlow("PRODUCT_IMAGE", "image/png", png(1200, 800));
    await expect(finalizeUpload(store, { token: ticket.token, userId: "u1", allowedPurposes: ["PRODUCT_IMAGE"], keyPrefix: "product-media/s1" }))
      .rejects.toThrow(/must be square \(1:1\)\. This image is 1200 × 800/);
    expect(await store.head(ticket.key)).toBeNull();
  });

  it("rejects a file whose bytes are not the declared kind", async () => {
    const ticket = await uploadFlow("PRODUCT_IMAGE", "image/png", new TextEncoder().encode("<script>alert(1)</script>"));
    await expect(finalizeUpload(store, { token: ticket.token, userId: "u1", allowedPurposes: ["PRODUCT_IMAGE"], keyPrefix: "product-media/s1" })).rejects.toThrow(/not a JPG, PNG or WebP/);
  });

  it("accepts MOV videos", async () => {
    const ticket = await uploadFlow("SITE_VIDEO", "video/quicktime", mov);
    const result = await finalizeUpload(store, { token: ticket.token, userId: "u1", allowedPurposes: ["SITE_VIDEO"], keyPrefix: "product-media/s1" });
    expect(result.detected.mimeType).toBe("video/quicktime");
  });

  it("binds tokens to the user, purpose and prefix", async () => {
    const ticket = await uploadFlow("PRODUCT_IMAGE", "image/png", png(800, 800));
    expect(() => verifyUploadToken(ticket.token, "someone-else")).toThrow(/another user/);
    expect(() => verifyUploadToken(ticket.token.slice(0, -2) + "xx", "u1")).toThrow(/Invalid/);
    await expect(finalizeUpload(store, { token: ticket.token, userId: "u1", allowedPurposes: ["PRODUCT_IMAGE"], keyPrefix: "product-media/other-seller" })).rejects.toThrow(/not allowed/);
  });

  it("refuses unsupported types before upload", async () => {
    await expect(createUpload(store, { purpose: "SITE_IMAGE", keyPrefix: "site-media", userId: "u1", contentType: "image/svg+xml", byteSize: 10, localUploadPath: "/x" })).rejects.toThrow(/JPG, PNG or WebP/);
  });
});

describe("serveStoredMedia", () => {
  it("streams byte ranges without loading the whole file", async () => {
    await store.put("site-media/v.mp4", new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 256)), "video/mp4");
    const response = await serveStoredMedia(store, "site-media/v.mp4", "video/mp4", "bytes=100-199");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(new Uint8Array(await response.arrayBuffer())[0]).toBe(100);
    expect((await serveStoredMedia(store, "site-media/v.mp4", "video/mp4", null)).status).toBe(200);
    expect((await serveStoredMedia(store, "site-media/v.mp4", "video/mp4", "bytes=5000-")).status).toBe(416);
  });
});
