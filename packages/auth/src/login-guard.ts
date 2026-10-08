import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { loginAttempts, type Database } from "@azadimart/database";
import { AppError } from "@azadimart/shared";

export type LoginAudience = "storefront" | "seller" | "admin";

export type LoginFailureReason = "INVALID_CREDENTIALS" | "CAPTCHA_FAILED" | "LOCKED";

/**
 * Sliding-window brute-force policy. Account limits are keyed by the submitted
 * email (existing or not, so lockouts do not reveal which accounts exist);
 * IP limits catch one client spraying many emails.
 */
export const LOGIN_POLICY = {
  account: {
    storefront: { maxFailures: 5, windowMinutes: 15 },
    seller: { maxFailures: 5, windowMinutes: 15 },
    admin: { maxFailures: 5, windowMinutes: 30 },
  },
  ip: { maxFailures: 20, windowMinutes: 15 },
} as const;

/** Client IP as reported by the platform proxy (Vercel sets x-forwarded-for). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function retryMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many failed sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/**
 * Seconds until the window frees up, or 0 when under the limit. `failures` are
 * the most recent counted failures, newest first.
 */
export function secondsUntilUnlocked(
  failures: Date[],
  maxFailures: number,
  windowMinutes: number,
  now: Date,
): number {
  if (failures.length < maxFailures) return 0;
  const oldestCounted = failures[maxFailures - 1]!;
  const unlockAt = oldestCounted.getTime() + windowMinutes * 60_000;
  return Math.max(0, Math.ceil((unlockAt - now.getTime()) / 1000));
}

/** Throws RATE_LIMITED (429) when the account or IP is temporarily locked. */
export async function assertLoginAllowed(
  db: Database,
  input: { email: string; ipAddress: string; audience: LoginAudience; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const accountPolicy = LOGIN_POLICY.account[input.audience];
  const ipPolicy = LOGIN_POLICY.ip;

  const lastSuccess = (await db
    .select({ createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, input.email), eq(loginAttempts.success, true)))
    .orderBy(desc(loginAttempts.createdAt))
    .limit(1))[0]?.createdAt;

  const accountWindowStart = new Date(now.getTime() - accountPolicy.windowMinutes * 60_000);
  const accountSince = lastSuccess && lastSuccess > accountWindowStart ? lastSuccess : accountWindowStart;

  const accountFailures = await db
    .select({ createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.email, input.email),
      eq(loginAttempts.success, false),
      eq(loginAttempts.reason, "INVALID_CREDENTIALS"),
      gt(loginAttempts.createdAt, accountSince),
    ))
    .orderBy(desc(loginAttempts.createdAt))
    .limit(accountPolicy.maxFailures);

  const accountWait = secondsUntilUnlocked(
    accountFailures.map((row) => row.createdAt),
    accountPolicy.maxFailures,
    accountPolicy.windowMinutes,
    now,
  );

  let ipWait = 0;
  if (input.ipAddress !== "unknown") {
    const ipFailures = await db
      .select({ createdAt: loginAttempts.createdAt })
      .from(loginAttempts)
      .where(and(
        eq(loginAttempts.ipAddress, input.ipAddress),
        eq(loginAttempts.success, false),
        inArray(loginAttempts.reason, ["INVALID_CREDENTIALS", "CAPTCHA_FAILED"]),
        gt(loginAttempts.createdAt, new Date(now.getTime() - ipPolicy.windowMinutes * 60_000)),
      ))
      .orderBy(desc(loginAttempts.createdAt))
      .limit(ipPolicy.maxFailures);
    ipWait = secondsUntilUnlocked(
      ipFailures.map((row) => row.createdAt),
      ipPolicy.maxFailures,
      ipPolicy.windowMinutes,
      now,
    );
  }

  const wait = Math.max(accountWait, ipWait);
  if (wait > 0) {
    throw new AppError("RATE_LIMITED", retryMessage(wait), { retryAfterSeconds: wait });
  }
}

export async function recordLoginAttempt(
  db: Database,
  attempt: {
    email: string;
    ipAddress: string;
    audience: LoginAudience;
    success: boolean;
    reason?: LoginFailureReason;
    userId?: string;
    userAgent?: string | null;
  },
): Promise<void> {
  await db.insert(loginAttempts).values({
    email: attempt.email,
    ipAddress: attempt.ipAddress,
    audience: attempt.audience,
    success: attempt.success,
    reason: attempt.reason ?? null,
    userId: attempt.userId ?? null,
    userAgent: attempt.userAgent?.slice(0, 500) ?? null,
  });
}
