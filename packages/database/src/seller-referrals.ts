import { randomInt } from "node:crypto";
import { COMMISSION_RATE_BPS, REFERRAL_BONUS_MONTHS, REFERRAL_MAX_REWARDS, commissionFreeUntil } from "@azadimart/shared";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import { auditLogs, sellerCommissionFreePeriods, sellerNotifications, sellers } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// No 0/O/1/I so codes are easy to read out and type.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => "LOI" + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const normaliseReferralCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The seller's referral code, created the first time it's needed. */
export async function ensureReferralCode(db: Db, sellerId: string): Promise<string> {
  const current = (await db.select({ code: sellers.referralCode }).from(sellers).where(eq(sellers.id, sellerId)).limit(1))[0];
  if (current?.code) return current.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const saved = await db.update(sellers).set({ referralCode: code }).where(and(eq(sellers.id, sellerId), sql`${sellers.referralCode} is null`))
      .returning({ code: sellers.referralCode }).catch(() => []);
    if (saved[0]?.code) return saved[0].code;
    const again = (await db.select({ code: sellers.referralCode }).from(sellers).where(eq(sellers.id, sellerId)).limit(1))[0];
    if (again?.code) return again.code;
  }
  throw new Error("Could not create a referral code");
}

/** The active seller a referral code belongs to (null for unknown or suspended sellers). */
export async function findReferrer(db: Db, code: string): Promise<{ id: string; storeName: string } | null> {
  const normalised = normaliseReferralCode(code);
  if (!normalised) return null;
  const row = (await db.select({ id: sellers.id, storeName: sellers.storeName, status: sellers.status }).from(sellers).where(eq(sellers.referralCode, normalised)).limit(1))[0];
  return row && row.status !== "SUSPENDED" ? { id: row.id, storeName: row.storeName } : null;
}

const addMonths = (date: Date, months: number) => { const d = new Date(date); d.setMonth(d.getMonth() + months); return d; };

/**
 * When a referred seller's first order is delivered, their referrer earns
 * REFERRAL_BONUS_MONTHS more commission-free months (up to REFERRAL_MAX_REWARDS
 * referrals). The new period starts when the referrer's current free time
 * ends, or now if it already ended, so earlier orders are never affected.
 * Runs once per referred seller (inside the delivery transaction).
 * Paused while sellers pay no commission (free months would be worth nothing).
 */
export async function rewardReferralOnFirstDelivery(tx: Tx, referredSellerId: string): Promise<void> {
  if (COMMISSION_RATE_BPS === 0) return;
  const referred = (await tx.select({ referredBy: sellers.referredBySellerId, rewardedAt: sellers.referralRewardedAt, status: sellers.status, gstin: sellers.gstin, pan: sellers.pan, storeName: sellers.storeName })
    .from(sellers).where(eq(sellers.id, referredSellerId)).limit(1).for("update"))[0];
  if (!referred?.referredBy || referred.rewardedAt || referred.status !== "ACTIVE") return;
  const referrer = (await tx.select({ id: sellers.id, approvedAt: sellers.approvedAt, gstin: sellers.gstin, pan: sellers.pan, status: sellers.status })
    .from(sellers).where(eq(sellers.id, referred.referredBy)).limit(1).for("update"))[0];
  await tx.update(sellers).set({ referralRewardedAt: new Date() }).where(eq(sellers.id, referredSellerId));
  if (!referrer || referrer.status === "SUSPENDED") return;
  // The same business can't refer itself through a second account.
  const sameBusiness = (referred.gstin && referred.gstin === referrer.gstin) || (referred.pan && referred.pan === referrer.pan);
  const [earned] = await tx.select({ n: count() }).from(sellerCommissionFreePeriods).where(and(eq(sellerCommissionFreePeriods.sellerId, referrer.id), eq(sellerCommissionFreePeriods.reason, "REFERRAL")));
  const capped = Number(earned?.n ?? 0) >= REFERRAL_MAX_REWARDS;
  if (sameBusiness || capped) {
    await tx.insert(auditLogs).values({ actorUserId: null, action: "SELLER_REFERRAL_NOT_REWARDED", entityType: "seller", entityId: referrer.id, metadata: { referredSellerId, reason: sameBusiness ? "same business" : "limit reached" } });
    return;
  }
  const lastPeriod = (await tx.select({ endsAt: sellerCommissionFreePeriods.endsAt }).from(sellerCommissionFreePeriods)
    .where(eq(sellerCommissionFreePeriods.sellerId, referrer.id)).orderBy(desc(sellerCommissionFreePeriods.endsAt)).limit(1))[0];
  const now = new Date();
  const freeUntil = [now, referrer.approvedAt ? commissionFreeUntil(referrer.approvedAt) : now, lastPeriod?.endsAt ?? now].reduce((a, b) => (b > a ? b : a));
  const endsAt = addMonths(freeUntil, REFERRAL_BONUS_MONTHS);
  await tx.insert(sellerCommissionFreePeriods).values({ sellerId: referrer.id, startsAt: freeUntil, endsAt, reason: "REFERRAL", referredSellerId });
  await tx.insert(auditLogs).values({ actorUserId: null, action: "SELLER_REFERRAL_REWARDED", entityType: "seller", entityId: referrer.id, metadata: { referredSellerId, startsAt: freeUntil.toISOString(), endsAt: endsAt.toISOString() } });
  await tx.insert(sellerNotifications).values({
    sellerId: referrer.id, kind: "REFERRAL_REWARD",
    title: `You earned ${REFERRAL_BONUS_MONTHS} more months with no commission`,
    body: `${referred.storeName} delivered their first order. No commission or platform fee on your orders until ${endsAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`,
    href: "/referrals", dedupeKey: `REFERRAL_REWARD:${referredSellerId}`,
  }).onConflictDoNothing();
}
