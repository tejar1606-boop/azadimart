import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts sensitive values (bank account numbers) with AES-256-GCM before
 * they are stored. The key lives only in the DATA_ENCRYPTION_KEY environment
 * variable (32 random bytes, base64), never in the database.
 */
function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  const buf = raw ? Buffer.from(raw, "base64") : null;
  if (!buf || buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
