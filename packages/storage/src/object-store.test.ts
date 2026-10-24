import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { assertUploadsAvailable, isValidStorageKey, LocalObjectStore, s3ConfigFromEnv } from "./object-store";

describe("storage keys", () => {
  it("accepts server-generated keys", () => {
    expect(isValidStorageKey("product-media/0b0e/abc.jpg")).toBe(true);
    expect(isValidStorageKey("private-documents/0b0e/abc.pdf")).toBe(true);
  });

  it("rejects traversal and absolute or odd keys", () => {
    for (const key of ["../etc/passwd", "a/../b", "/abs.jpg", "a\\b.jpg", "a//b.jpg", "", "a/.hidden", "a b.jpg"]) {
      expect(isValidStorageKey(key), key).toBe(false);
    }
  });
});

describe("LocalObjectStore", () => {
  let dir: string;
  afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it("round-trips bytes, refuses overwrite, and returns null when missing", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "azadimart-store-"));
    const store = new LocalObjectStore(dir);
    await store.put("product-media/s1/a.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(Array.from((await store.get("product-media/s1/a.png"))!)).toEqual([1, 2, 3]);
    await expect(store.put("product-media/s1/a.png", new Uint8Array([9]), "image/png")).rejects.toThrow();
    expect(await store.get("product-media/s1/missing.png")).toBeNull();
    await store.delete("product-media/s1/a.png");
    expect(await store.get("product-media/s1/a.png")).toBeNull();
    await expect(store.get("../outside")).rejects.toThrow(/Invalid storage key/);
  });
});

describe("configuration", () => {
  it("uses S3/R2 only when bucket and keys are present", () => {
    expect(s3ConfigFromEnv({ STORAGE_DRIVER: "s3", STORAGE_BUCKET: "" })).toBeNull();
    expect(s3ConfigFromEnv({ STORAGE_BUCKET: "b", STORAGE_ACCESS_KEY_ID: "k", STORAGE_SECRET_ACCESS_KEY: "s", STORAGE_ENDPOINT: "https://x.r2.cloudflarestorage.com" }))
      .toMatchObject({ bucket: "b", region: "auto", endpoint: "https://x.r2.cloudflarestorage.com" });
    expect(s3ConfigFromEnv({ STORAGE_DRIVER: "local", STORAGE_BUCKET: "b", STORAGE_ACCESS_KEY_ID: "k", STORAGE_SECRET_ACCESS_KEY: "s" })).toBeNull();
  });

  it("refuses local-disk uploads in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertUploadsAvailable(new LocalObjectStore("/tmp"))).toThrow("STORAGE_NOT_CONFIGURED");
    vi.unstubAllEnvs();
  });
});

describe("S3ObjectStore", () => {
  it("writes with no-overwrite, reads bytes, and maps NoSuchKey to null", async () => {
    const { S3ObjectStore } = await import("./object-store");
    const sent: Array<{ name: string; input: Record<string, unknown> }> = [];
    const client = {
      send: vi.fn(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: command.constructor.name, input: command.input });
        if (command.constructor.name === "GetObjectCommand") {
          if (command.input.Key === "product-media/s/missing.png") throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
          return { Body: { transformToByteArray: async () => new Uint8Array([7, 8]) } };
        }
        return {};
      }),
    };
    const store = new S3ObjectStore({ bucket: "b", region: "auto", accessKeyId: "k", secretAccessKey: "s" }, client as never);
    await store.put("product-media/s/a.png", new Uint8Array([1]), "image/png");
    expect(sent[0]).toMatchObject({ name: "PutObjectCommand", input: { Bucket: "b", Key: "product-media/s/a.png", ContentType: "image/png", IfNoneMatch: "*" } });
    expect(Array.from((await store.get("product-media/s/a.png"))!)).toEqual([7, 8]);
    expect(await store.get("product-media/s/missing.png")).toBeNull();
    await expect(store.put("../x", new Uint8Array([1]), "image/png")).rejects.toThrow(/Invalid storage key/);
  });
});
