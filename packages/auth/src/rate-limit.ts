import { AppError, logger } from "@azadimart/shared";
import { sql } from "drizzle-orm";
import type { createDatabase } from "@azadimart/database";
import { getClientIp } from "./login-guard";

type Db = ReturnType<typeof createDatabase>;
export type RateLimitRule = { limit: number; windowSeconds: number };

/** Limits per action. Generous for real shoppers and sellers, tight enough to stop scripted abuse. */
export const RATE_LIMITS = {
  register: { limit: 5, windowSeconds: 60 * 60 },
  checkout: { limit: 10, windowSeconds: 10 * 60 },
  coupon: { limit: 30, windowSeconds: 10 * 60 },
  cart: { limit: 120, windowSeconds: 60 },
  upload: { limit: 60, windowSeconds: 10 * 60 },
  kycSubmit: { limit: 10, windowSeconds: 60 * 60 },
  productCreate: { limit: 60, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

function retryText(seconds: number) {
  if (seconds < 90) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Counts this request against a fixed window for the caller (signed-in
 * user, else IP address) and throws RATE_LIMITED (429) once over the limit.
 * Counters live in Postgres so the limit holds across server instances. If
 * the counter can't be updated the request is allowed: the limiter must
 * never take the store down. Local requests without an IP are not limited
 * outside production, so tests can run freely.
 */
export async function enforceRateLimit(db: Db, request: Request, action: keyof typeof RATE_LIMITS | string, options: { subject?: string; rule?: RateLimitRule } = {}): Promise<void> {
  const rule = options.rule ?? RATE_LIMITS[action as keyof typeof RATE_LIMITS];
  if (!rule) throw new Error(`Unknown rate limit: ${action}`);
  const ip = getClientIp(request);
  if (!options.subject && ip === "unknown" && process.env.NODE_ENV !== "production") return;
  const key = `${action}:${options.subject ? "user:" + options.subject : "ip:" + ip}`;

  let count = 0;
  let windowStart = new Date();
  try {
    const result = await db.execute<{ count: number; window_start: string }>(sql`
      insert into rate_limit_buckets (key, window_start, count) values (${key}, now(), 1)
      on conflict (key) do update set
        count = case when rate_limit_buckets.window_start < now() - make_interval(secs => ${rule.windowSeconds}) then 1 else rate_limit_buckets.count + 1 end,
        window_start = case when rate_limit_buckets.window_start < now() - make_interval(secs => ${rule.windowSeconds}) then now() else rate_limit_buckets.window_start end
      returning count, window_start`);
    count = Number(result.rows[0]?.count ?? 0);
    windowStart = new Date(result.rows[0]?.window_start ?? Date.now());
    // Occasionally clear out day-old counters.
    if (Math.random() < 0.01) await db.execute(sql`delete from rate_limit_buckets where window_start < now() - interval '1 day'`);
  } catch (error) {
    logger.warn("Rate limiter unavailable; allowing request", { action, errorMessage: error instanceof Error ? error.message : String(error) });
    return;
  }

  if (count > rule.limit) {
    const retryAfter = Math.max(1, rule.windowSeconds - (Date.now() - windowStart.getTime()) / 1000);
    throw new AppError("RATE_LIMITED", `Too many requests. Please try again in ${retryText(retryAfter)}.`);
  }
}
