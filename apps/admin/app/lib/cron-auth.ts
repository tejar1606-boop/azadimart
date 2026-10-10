import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; admins can also
 * run jobs from the console. Returns who is running it, or null if not allowed.
 */
export async function cronCaller(request: Request): Promise<{ kind: "cron" } | { kind: "admin"; userId: string } | null> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (secret && header.startsWith("Bearer ")) {
    const given = Buffer.from(header.slice(7)), expected = Buffer.from(secret);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { kind: "cron" };
  }
  const principal = await getSessionPrincipal(request, createDatabase()).catch(() => null);
  return principal && (principal.role === "ADMIN" || principal.role === "SUPER_ADMIN") ? { kind: "admin", userId: principal.userId } : null;
}
