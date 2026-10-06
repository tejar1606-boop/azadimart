import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  customers,
  createDatabase,
  sessions,
  sellers,
  users,
  type Database,
} from "@azadimart/database";
import type { Role } from "@azadimart/shared";
import type { SessionPrincipal } from "./guards";

export const SESSION_COOKIE_NAME = "azadimart_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
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
): Promise<SessionPrincipal | null> {
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

  const principal: SessionPrincipal = {
    userId: session.userId,
    role: session.role as Role,
  };

  if (principal.role === "SELLER") {
    const seller = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(eq(sellers.userId, principal.userId))
      .limit(1);
    principal.sellerId = seller[0]?.id;
  }

  if (principal.role === "CUSTOMER") {
    const customer = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.userId, principal.userId))
      .limit(1);
    principal.customerId = customer[0]?.id;
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