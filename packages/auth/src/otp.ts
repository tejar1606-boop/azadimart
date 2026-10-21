import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { loginOtps, users, type Database } from "@azadimart/database";
import { AppError, logger, testProvidersAllowed, type Role } from "@azadimart/shared";
import { getClientIp, type LoginAudience } from "./login-guard";
import { enforceRateLimit } from "./rate-limit";
import { createSession } from "./session";

/** OTP login for shoppers and sellers. SMS is sent through SMS_PROVIDER (see sendOtpSms). */
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 30;

export type SmsProvider = "msg91" | "console" | "none";

/** "console" prints the code instead of texting it and is refused in production. */
export function smsProvider(): SmsProvider {
  const configured = (process.env.SMS_PROVIDER ?? "").toLowerCase();
  if (configured === "msg91" && process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID) return "msg91";
  if (testProvidersAllowed() && (configured === "console" || configured === "")) return "console";
  return "none";
}

export function isOtpLoginAvailable(): boolean {
  return smsProvider() !== "none";
}

/** HMAC (keyed with AUTH_SECRET) of the code, bound to the phone so a hash can't be reused for another number. */
export function hashOtp(code: string, phone: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export function otpMatches(code: string, phone: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(code, phone), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function sendOtpSms(phone: string, code: string): Promise<void> {
  const provider = smsProvider();
  if (provider === "console") {
    logger.info("OTP (console SMS, development only)", { phone: `******${phone.slice(-4)}`, code });
    return;
  }
  if (provider === "msg91") {
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.searchParams.set("template_id", process.env.MSG91_OTP_TEMPLATE_ID!);
    url.searchParams.set("mobile", "91" + phone);
    url.searchParams.set("otp", code);
    const response = await fetch(url, { method: "POST", headers: { authkey: process.env.MSG91_AUTH_KEY!, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      logger.error("OTP SMS failed", { status: response.status });
      throw new AppError("UNPROCESSABLE", "We couldn't send the code right now. Please try again or log in with your password.");
    }
    return;
  }
  throw new AppError("UNPROCESSABLE", "OTP login isn't available yet. Please log in with your password.");
}

/**
 * Sends a login code to a registered phone. The response is the same whether or
 * not the number has an account, so the endpoint can't be used to find accounts.
 * In development (console SMS) the code is also returned for testing.
 */
export async function requestLoginOtp(
  db: Database,
  request: Request,
  phone: string,
  audience: LoginAudience,
  allowedRoles: Role[],
): Promise<{ sent: true; devCode?: string }> {
  if (!isOtpLoginAvailable()) throw new AppError("UNPROCESSABLE", "OTP login isn't available yet. Please log in with your password.");
  await enforceRateLimit(db, request, "otpRequest");
  await enforceRateLimit(db, request, "otpRequestPhone", { subject: `${audience}:${phone}` });

  const user = (await db.select({ id: users.id, role: users.role, status: users.status }).from(users).where(eq(users.phone, phone)).limit(1))[0];
  if (!user || user.status !== "ACTIVE" || !allowedRoles.includes(user.role as Role)) return { sent: true };

  const last = (await db.select({ createdAt: loginOtps.createdAt }).from(loginOtps)
    .where(and(eq(loginOtps.phone, phone), eq(loginOtps.audience, audience)))
    .orderBy(desc(loginOtps.createdAt)).limit(1))[0];
  if (last && Date.now() - last.createdAt.getTime() < OTP_RESEND_SECONDS * 1000) {
    throw new AppError("RATE_LIMITED", `Please wait ${OTP_RESEND_SECONDS} seconds before asking for a new code.`, { retryAfterSeconds: OTP_RESEND_SECONDS });
  }

  const code = generateOtp();
  // Only the newest code works: earlier unused codes for this number are retired.
  await db.update(loginOtps).set({ consumedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(loginOtps.phone, phone), eq(loginOtps.audience, audience), isNull(loginOtps.consumedAt)));
  await db.insert(loginOtps).values({ userId: user.id, phone, audience, codeHash: hashOtp(code, phone), expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) });
  await sendOtpSms(phone, code);
  return smsProvider() === "console" ? { sent: true, devCode: code } : { sent: true };
}

/** Checks a code and, if right, signs the user in exactly like a password login. */
export async function verifyLoginOtp(
  db: Database,
  request: Request,
  phone: string,
  code: string,
  audience: LoginAudience,
  allowedRoles: Role[],
): Promise<{ token: string; userId: string; role: Role }> {
  await enforceRateLimit(db, request, "otpVerify");
  const wrong = new AppError("UNAUTHORIZED", "That code is incorrect or has expired. Please request a new one.");

  const challenge = (await db.select().from(loginOtps)
    .where(and(eq(loginOtps.phone, phone), eq(loginOtps.audience, audience), isNull(loginOtps.consumedAt)))
    .orderBy(desc(loginOtps.createdAt)).limit(1))[0];
  if (!challenge || challenge.expiresAt.getTime() < Date.now() || challenge.attempts >= OTP_MAX_ATTEMPTS) throw wrong;

  if (!otpMatches(code, phone, challenge.codeHash)) {
    const attempts = challenge.attempts + 1;
    await db.update(loginOtps).set({ attempts, ...(attempts >= OTP_MAX_ATTEMPTS ? { consumedAt: new Date() } : {}), updatedAt: new Date() }).where(eq(loginOtps.id, challenge.id));
    logger.warn("OTP login failed", { audience, ip: getClientIp(request), attempts });
    throw wrong;
  }

  // Single use: only one request can claim the code, even if two arrive together.
  const claimed = await db.update(loginOtps).set({ consumedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(loginOtps.id, challenge.id), isNull(loginOtps.consumedAt))).returning({ id: loginOtps.id });
  if (!claimed.length) throw wrong;

  const user = (await db.select({ id: users.id, role: users.role, status: users.status }).from(users)
    .where(and(eq(users.id, challenge.userId), inArray(users.role, allowedRoles))).limit(1))[0];
  if (!user || user.status !== "ACTIVE") throw wrong;

  const token = await createSession(db, user.id);
  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: sql`now()` }).where(eq(users.id, user.id));
  return { token, userId: user.id, role: user.role as Role };
}
