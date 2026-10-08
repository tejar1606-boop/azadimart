import { eq } from "drizzle-orm";
import { createDatabase, users, type Database } from "@azadimart/database";
import { AppError, type Role } from "@azadimart/shared";
import { verifyCaptcha } from "./captcha";
import { assertLoginAllowed, getClientIp, recordLoginAttempt, type LoginAudience } from "./login-guard";
import { createSession, hashPassword, verifyPassword } from "./session";

// Hash checked when the email is unknown so response time does not reveal
// whether an account exists.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomUUID());
  return dummyHash;
}

export async function loginUser(
  db: Database,
  email: string,
  password: string,
  allowedRoles: Role[],
): Promise<{ token: string; userId: string; role: Role }> {
  const rows = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  const user = rows[0];
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.passwordHash || !valid || user.status !== "ACTIVE" || !allowedRoles.includes(user.role as Role)) {
    throw new AppError("UNAUTHORIZED", "Invalid email or password");
  }

  const token = await createSession(db, user.id);
  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));

  return { token, userId: user.id, role: user.role as Role };
}

/**
 * Login with pre-authentication checks, in order:
 * 1. brute-force lockout (per account and per IP)
 * 2. bot check (Cloudflare Turnstile, when configured)
 * 3. password verification
 * Every outcome is recorded in login_attempts.
 */
export async function protectedLogin(
  db: Database,
  request: Request,
  input: { email: string; password: string; captchaToken?: string },
  audience: LoginAudience,
  allowedRoles: Role[],
): Promise<{ token: string; userId: string; role: Role }> {
  const email = input.email.toLowerCase();
  const ipAddress = getClientIp(request);
  const userAgent = request.headers.get("user-agent");
  const record = (success: boolean, reason?: "INVALID_CREDENTIALS" | "CAPTCHA_FAILED" | "LOCKED", userId?: string) =>
    recordLoginAttempt(db, { email, ipAddress, audience, success, reason, userId, userAgent });

  try {
    await assertLoginAllowed(db, { email, ipAddress, audience });
  } catch (error) {
    if (error instanceof AppError && error.code === "RATE_LIMITED") await record(false, "LOCKED");
    throw error;
  }

  try {
    await verifyCaptcha(input.captchaToken, ipAddress);
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_ERROR") await record(false, "CAPTCHA_FAILED");
    throw error;
  }

  let result: { token: string; userId: string; role: Role };
  try {
    result = await loginUser(db, email, input.password, allowedRoles);
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") await record(false, "INVALID_CREDENTIALS");
    throw error;
  }
  await record(true, undefined, result.userId);
  return result;
}

export async function loginWithDatabase(
  email: string,
  password: string,
  allowedRoles: Role[],
): Promise<{ token: string; userId: string; role: Role }> {
  return loginUser(createDatabase(), email, password, allowedRoles);
}
