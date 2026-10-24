import { AppError, CUSTOMER_WALLET_KEY, DEFAULT_WALLET_SETTINGS, WALLET_REFUND_GRACE_DAYS, type WalletSettings } from "@azadimart/shared";
import { and, asc, desc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import { getPlatformSetting } from "./platform-settings";
import { customerWalletEntries, customers, signupBonusClaims, users } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Pick<Db, "select">;
const DAY = 24 * 60 * 60 * 1000;

export async function walletSettings(db: Exec): Promise<WalletSettings> {
  return { ...DEFAULT_WALLET_SETTINGS, ...((await getPlatformSetting<Partial<WalletSettings>>(db, CUSTOMER_WALLET_KEY)) ?? {}) };
}

const live = (now: Date) => and(gt(customerWalletEntries.remainingPaise, 0), or(isNull(customerWalletEntries.expiresAt), gt(customerWalletEntries.expiresAt, now)));

/** Money the shopper can use right now (expired credits don't count). */
export async function walletBalance(db: Exec, customerId: string, now = new Date()): Promise<number> {
  return (await db.select({ n: sql<number>`coalesce(sum(${customerWalletEntries.remainingPaise}), 0)::int` }).from(customerWalletEntries)
    .where(and(eq(customerWalletEntries.customerId, customerId), live(now))))[0]?.n ?? 0;
}

/** Balance, the next amount to expire, the history, and whether the welcome bonus can still be claimed. */
export async function walletSummary(db: Exec, customerId: string, now = new Date()) {
  const [balance, settings, entries, nextExpiry, granted, user] = await Promise.all([
    walletBalance(db, customerId, now),
    walletSettings(db),
    db.select({ id: customerWalletEntries.id, kind: customerWalletEntries.kind, amountPaise: customerWalletEntries.amountPaise, remainingPaise: customerWalletEntries.remainingPaise, expiresAt: customerWalletEntries.expiresAt, orderId: customerWalletEntries.orderId, note: customerWalletEntries.note, createdAt: customerWalletEntries.createdAt })
      .from(customerWalletEntries).where(eq(customerWalletEntries.customerId, customerId)).orderBy(desc(customerWalletEntries.createdAt)).limit(50),
    db.select({ amount: customerWalletEntries.remainingPaise, at: customerWalletEntries.expiresAt }).from(customerWalletEntries)
      .where(and(eq(customerWalletEntries.customerId, customerId), live(now), sql`${customerWalletEntries.expiresAt} is not null`)).orderBy(asc(customerWalletEntries.expiresAt)).limit(1).then((r) => r[0] ?? null),
    db.select({ id: signupBonusClaims.id, status: signupBonusClaims.status, reason: signupBonusClaims.reason }).from(signupBonusClaims).where(eq(signupBonusClaims.customerId, customerId)).orderBy(desc(signupBonusClaims.createdAt)).limit(1).then((r) => r[0] ?? null),
    db.select({ phone: users.phone, verifiedAt: users.phoneVerifiedAt }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(eq(customers.id, customerId)).limit(1).then((r) => r[0] ?? null),
  ]);
  return {
    balancePaise: balance, nextExpiry, entries,
    rules: { enabled: settings.enabled, bonusPaise: settings.bonusPaise, maxPerOrderPaise: settings.maxPerOrderPaise, minOrderPaise: settings.minOrderPaise, expiryDays: settings.expiryDays },
    bonus: granted?.status === "GRANTED" ? { state: "CLAIMED" as const } : granted?.status === "BLOCKED" ? { state: "NOT_ELIGIBLE" as const, reason: granted.reason } : !settings.enabled || settings.bonusPaise <= 0 ? { state: "OFF" as const } : { state: user?.verifiedAt ? ("READY" as const) : ("VERIFY_PHONE" as const) },
    phone: user?.phone ? "******" + user.phone.slice(-4) : null,
    phoneVerified: Boolean(user?.verifiedAt),
  };
}

const REASONS = {
  PHONE: "This mobile number already received the welcome bonus.",
  DEVICE: "The welcome bonus was already given on this device.",
  IP: "Too many new accounts from this internet connection today.",
} as const;

/**
 * Gives a new shopper the welcome bonus, once ever per verified mobile, per
 * device (random device ID or matching device fingerprint) and per shopper,
 * and only a few per internet connection a day. Refused attempts are kept
 * with the reason. Returns the result for the shop to show.
 */
export async function claimSignupBonus(db: Db, input: { customerId: string; deviceId?: string | null; fingerprint?: string | null; ipAddress?: string | null; userAgent?: string | null }) {
  const settings = await walletSettings(db);
  if (!settings.enabled || settings.bonusPaise <= 0) throw new AppError("UNPROCESSABLE", "The welcome bonus isn't running right now");
  const person = (await db.select({ phone: users.phone, verifiedAt: users.phoneVerifiedAt }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(eq(customers.id, input.customerId)).limit(1))[0];
  if (!person?.phone || !person.verifiedAt) throw new AppError("UNPROCESSABLE", "Verify your mobile number first");
  const phone = person.phone.replace(/\D/g, "").slice(-10);

  return db.transaction(async (tx) => {
    // One claim at a time per number (two tabs, two devices).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"signup_bonus:" + phone}, 0))`);
    const mine = (await tx.select().from(signupBonusClaims).where(and(eq(signupBonusClaims.customerId, input.customerId), eq(signupBonusClaims.status, "GRANTED"))).limit(1))[0];
    if (mine) return { granted: false as const, alreadyClaimed: true as const, reason: null };

    const sameDevice = (field: typeof signupBonusClaims.deviceId | typeof signupBonusClaims.fingerprint, value?: string | null) => value
      ? tx.select({ id: signupBonusClaims.id }).from(signupBonusClaims).where(and(eq(field, value), eq(signupBonusClaims.status, "GRANTED"))).limit(1).then((r) => r.length > 0) : Promise.resolve(false);
    const [phoneUsed, deviceUsed, fingerprintUsed, ipCount] = await Promise.all([
      tx.select({ id: signupBonusClaims.id }).from(signupBonusClaims).where(and(eq(signupBonusClaims.phone, phone), eq(signupBonusClaims.status, "GRANTED"))).limit(1).then((r) => r.length > 0),
      sameDevice(signupBonusClaims.deviceId, input.deviceId),
      sameDevice(signupBonusClaims.fingerprint, input.fingerprint),
      input.ipAddress ? tx.select({ n: sql<number>`count(*)::int` }).from(signupBonusClaims).where(and(eq(signupBonusClaims.ipAddress, input.ipAddress), eq(signupBonusClaims.status, "GRANTED"), gte(signupBonusClaims.createdAt, new Date(Date.now() - DAY)))).then((r) => r[0]?.n ?? 0) : Promise.resolve(0),
    ]);
    const blocked = phoneUsed ? REASONS.PHONE : deviceUsed || fingerprintUsed ? REASONS.DEVICE : ipCount >= settings.maxBonusesPerIpPerDay ? REASONS.IP : null;
    const base = { customerId: input.customerId, phone, deviceId: input.deviceId ?? null, fingerprint: input.fingerprint ?? null, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent?.slice(0, 300) ?? null };
    if (blocked) {
      await tx.insert(signupBonusClaims).values({ ...base, status: "BLOCKED", reason: blocked });
      return { granted: false as const, alreadyClaimed: false as const, reason: blocked };
    }
    await tx.insert(signupBonusClaims).values({ ...base, status: "GRANTED" });
    const expiresAt = new Date(Date.now() + settings.expiryDays * DAY);
    await tx.insert(customerWalletEntries).values({ customerId: input.customerId, kind: "SIGNUP_BONUS", amountPaise: settings.bonusPaise, remainingPaise: settings.bonusPaise, expiresAt, note: "Welcome bonus" });
    return { granted: true as const, alreadyClaimed: false as const, reason: null, amountPaise: settings.bonusPaise, expiresAt };
  });
}

/** Takes wallet money for an order (inside checkout's transaction): the credits that expire first are used first. */
export async function spendWallet(tx: Tx, input: { customerId: string; orderId: string; amountPaise: number }) {
  if (input.amountPaise <= 0) return;
  const now = new Date();
  const credits = await tx.select().from(customerWalletEntries).where(and(eq(customerWalletEntries.customerId, input.customerId), live(now)))
    .orderBy(sql`${customerWalletEntries.expiresAt} asc nulls last`, asc(customerWalletEntries.createdAt)).for("update");
  let left = input.amountPaise;
  const allocations: Array<{ entryId: string; amountPaise: number }> = [];
  for (const c of credits) {
    if (left <= 0) break;
    const take = Math.min(left, c.remainingPaise);
    await tx.update(customerWalletEntries).set({ remainingPaise: c.remainingPaise - take, updatedAt: now }).where(eq(customerWalletEntries.id, c.id));
    allocations.push({ entryId: c.id, amountPaise: take });
    left -= take;
  }
  if (left > 0) throw new AppError("CONFLICT", "Your wallet balance changed. Please try again.");
  await tx.insert(customerWalletEntries).values({ customerId: input.customerId, kind: "ORDER_SPEND", amountPaise: -input.amountPaise, orderId: input.orderId, allocations, note: "Used on an order" });
}

/**
 * A cancelled order gives its wallet money back to the credits it came from,
 * with at least a week left to use it. Safe to call twice.
 */
export async function refundWalletForOrder(tx: Tx, orderId: string) {
  const spend = (await tx.select().from(customerWalletEntries).where(and(eq(customerWalletEntries.orderId, orderId), eq(customerWalletEntries.kind, "ORDER_SPEND"))).limit(1))[0];
  if (!spend) return 0;
  const already = (await tx.select({ id: customerWalletEntries.id }).from(customerWalletEntries).where(and(eq(customerWalletEntries.orderId, orderId), eq(customerWalletEntries.kind, "ORDER_REFUND"))).limit(1))[0];
  if (already) return 0;
  const now = new Date(), grace = new Date(Date.now() + WALLET_REFUND_GRACE_DAYS * DAY);
  for (const a of spend.allocations) {
    await tx.update(customerWalletEntries).set({
      remainingPaise: sql`${customerWalletEntries.remainingPaise} + ${a.amountPaise}`,
      expiresAt: sql`case when ${customerWalletEntries.expiresAt} is not null and ${customerWalletEntries.expiresAt} < ${grace} then ${grace} else ${customerWalletEntries.expiresAt} end`,
      updatedAt: now,
    }).where(eq(customerWalletEntries.id, a.entryId));
  }
  await tx.insert(customerWalletEntries).values({ customerId: spend.customerId, kind: "ORDER_REFUND", amountPaise: -spend.amountPaise, orderId, note: "Order cancelled: money back in your wallet" });
  return -spend.amountPaise;
}
