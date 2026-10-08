import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Byte storage shared by all apps. Sellers upload in the seller app, admins
 * review KYC in the admin app and shoppers see product media on the
 * storefront, so every app must read and write the same store.
 *
 * - "s3": any S3-compatible bucket (Cloudflare R2, AWS S3). Used whenever
 *   STORAGE_BUCKET and access keys are configured. Keep the bucket private;
 *   media is streamed through the apps.
 * - "local": a directory shared by the monorepo apps for development
 *   (LOCAL_STORAGE_DIR, default <repo root>/.data). Not usable on serverless.
 */
export interface ObjectStore {
  readonly driver: "local" | "s3";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Returns null when the object does not exist. */
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** Storage keys are relative, slash-separated, with no traversal or odd characters. */
export function isValidStorageKey(key: string): boolean {
  return key.length > 0 && key.length <= 512 && KEY_PATTERN.test(key) && !key.split("/").includes("..");
}

function assertKey(key: string): void {
  if (!isValidStorageKey(key)) throw new Error(`Invalid storage key: ${key}`);
}

export class LocalObjectStore implements ObjectStore {
  readonly driver = "local" as const;
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertKey(key);
    const root = path.resolve(this.root);
    const absolute = path.resolve(root, key);
    if (!absolute.startsWith(root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return absolute;
  }

  async put(key: string, body: Uint8Array, _contentType?: string): Promise<void> {
    const absolute = this.resolve(key);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, body, { flag: "wx" });
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.resolve(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export type S3StoreConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export class S3ObjectStore implements ObjectStore {
  readonly driver = "s3" as const;
  private readonly client: S3Client;

  constructor(private readonly config: S3StoreConfig, client?: S3Client) {
    this.client = client ?? new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    assertKey(key);
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Never overwrite an existing object (keys are random UUIDs).
      IfNoneMatch: "*",
    }));
  }

  async get(key: string): Promise<Uint8Array | null> {
    assertKey(key);
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return result.Body ? await result.Body.transformToByteArray() : null;
    } catch (error) {
      if (error instanceof NoSuchKey || (error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

/** Nearest ancestor of `start` containing pnpm-workspace.yaml, else `start`. */
export function findWorkspaceRoot(start: string): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3StoreConfig | null {
  const bucket = env.STORAGE_BUCKET?.trim();
  const accessKeyId = env.STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.STORAGE_SECRET_ACCESS_KEY?.trim();
  if (env.STORAGE_DRIVER?.trim() === "local" || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    region: env.STORAGE_REGION?.trim() || "auto",
    endpoint: env.STORAGE_ENDPOINT?.trim() || undefined,
  };
}

let store: ObjectStore | undefined;

export function getObjectStore(): ObjectStore {
  if (!store) {
    const s3 = s3ConfigFromEnv();
    store = s3
      ? new S3ObjectStore(s3)
      : new LocalObjectStore(process.env.LOCAL_STORAGE_DIR?.trim() || path.join(findWorkspaceRoot(process.cwd()), ".data"));
  }
  return store;
}

/** Local disk is not shared between serverless instances; refuse uploads there in production. */
export function assertUploadsAvailable(objectStore: ObjectStore = getObjectStore()): void {
  if (objectStore.driver === "local" && process.env.NODE_ENV === "production") {
    throw new Error("STORAGE_NOT_CONFIGURED");
  }
}

export function setObjectStoreForTesting(objectStore: ObjectStore | undefined): void {
  store = objectStore;
}
