import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createDatabase, customers, sessions, sellers, users, type Database } from "@azadimart/database";
import type { Role } from "@azadimart/shared";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

export const SESSION_COOKIE_NAME = "azadimart_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  try {
    const saltEncoded = parts[4];
    const expectedEncoded = parts[5];
    if (!saltEncoded || !expectedEncoded) return false;

    const salt = Buffer.from(saltEncoded, "base64url");
    const expected = Buffer.from(expectedEncoded, "base64url");
    const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;

    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createSession(
  db: Database,
  userId: string,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return token;
}

export async function revokeSession(db: Database, token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(token)));
}

export async function getSessionPrincipal(
  request: Request,
  db: Database = createDatabase(),
): Promise<import("./guards").SessionPrincipal | null> {
  const token = getCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;

  const rows = await db
    .select({ userId: users.id, role: users.role, status: users.status })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const session = rows[0];
  if (!session || session.status !== "ACTIVE") return null;

  const principal: import("./guards").SessionPrincipal = {
    userId: session.userId,
    role: session.role as Role,
  };

  if (principal.role === "SELLER") {
    const sellerRows = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(eq(sellers.userId, principal.userId))
      .limit(1);
    principal.sellerId = sellerRows[0]?.id;
  }

  if (principal.role === "CUSTOMER") {
    const customerRows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.userId, principal.userId))
      .limit(1);
    principal.customerId = customerRows[0]?.id;
  }

  return principal;
}

export function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const segment of cookieHeader.split(";")) {
    const [key, ...valueParts] = segment.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }

  return null;
}

export function sessionCookie(token: string, maxAgeSeconds = SESSION_MAX_AGE_SECONDS): string {
  const secure = process.env.NODE_ENV === "production";
  return [
    SESSION_COOKIE_NAME + "=" + encodeURIComponent(token),
    "Path=/",
    "Max-Age=" + maxAgeSeconds,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
