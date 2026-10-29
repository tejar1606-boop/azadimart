import { randomInt } from "node:crypto";
import { AppError } from "@azadimart/shared";
import { and, asc, count, desc, eq, inArray, lte, notInArray, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import { walletSettings } from "./customer-wallet";
import { normaliseReferralCode } from "./seller-referrals";
import { customerReferralRewards, customerWalletEntries, customers, orders, signupBonusClaims, users } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Pick<Db, "select">;
const DAY = 24 * 60 * 60 * 1000;

// No 0/O/1/I so codes are easy to read out and type.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => "LM" + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
/** Orders that count as "has ordered": placed and not cancelled, returned or still waiting for payment. */
const NOT_AN_ORDER = ["CREATED", "PAYMENT_PENDING", "CANCELLED", "RETURNED"] as const;

/** Whether the shopper has placed an order of their own (what unlocks Refer & earn). */
export async function hasPlacedOrder(db: Exec, customerId: string): Promise<boolean> {
  const row = (await db.select({ id: orders.id }).from(orders).where(and(eq(orders.customerId, customerId), notInArray(orders.status, [...NOT_AN_ORDER]))).limit(1))[0];
  return Boolean(row);
}

/** The shopper's referral code, created the first time it's needed (only after their first order). */
export async function ensureCustomerReferralCode(db: Db, customerId: string): Promise<string | null> {
  const current = (await db.select({ code: customers.referralCode }).from(customers).where(eq(customers.id, customerId)).limit(1))[0];
  if (current?.code) return current.code;
  if (!(await hasPlacedOrder(db, customerId))) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const saved = await db.update(customers).set({ referralCode: newCode() }).where(and(eq(customers.id, customerId), sql`${customers.referralCode} is null`))
      .returning({ code: customers.referralCode }).catch(() => []);
    if (saved[0]?.code) return saved[0].code;
    const again = (await db.select({ code: customers.referralCode }).from(customers).where(eq(customers.id, customerId)).limit(1))[0];
    if (again?.code) return again.code;
  }
  throw new Error("Could not create a referral code");
}

/** The shopper a referral code belongs to, if they can still invite people (active account, has ordered). */
export async function findCustomerReferrer(db: Exec, code: string): Promise<{ id: string } | null> {
  const normalised = normaliseReferralCode(code);
  if (!normalised) return null;
  const row = (await db.select({ id: customers.id, status: users.status }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(eq(customers.referralCode, normalised)).limit(1))[0];
  return row && row.status === "ACTIVE" && (await hasPlacedOrder(db, row.id)) ? { id: row.id } : null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "Friend";

/** Refer & earn page: the code (once unlocked), what it pays, and every friend invited with where they are. */
export async function customerReferralSummary(db: Db, customerId: string) {
  const settings = await walletSettings(db);
  const on = settings.enabled && settings.referralEnabled && settings.referralRewardPaise > 0;
  const code = on ? await ensureCustomerReferralCode(db, customerId) : null;
  const friends = await db.select({ id: customers.id, name: customers.fullName, joinedAt: customers.createdAt, status: customerReferralRewards.status, reason: customerReferralRewards.reason, amountPaise: customerReferralRewards.amountPaise, rewardedAt: customerReferralRewards.createdAt })
    .from(customers).leftJoin(customerReferralRewards, eq(customerReferralRewards.referredCustomerId, customers.id))
    .where(eq(customers.referredByCustomerId, customerId)).orderBy(desc(customers.createdAt)).limit(100);
  // Where each friend without a reward is: ordered, delivered (return window still open) or only returned orders.
  const progress = new Map<string, { ordered: boolean; deliveredAt: Date | null; returned: boolean }>();
  const waiting = friends.filter((f) => !f.status).map((f) => f.id);
  if (waiting.length) {
    const rows = await db.select({ c: orders.customerId, status: orders.status, deliveredAt: orders.deliveredAt, kept: sql<boolean>`(${orderKept})` }).from(orders)
      .where(and(inArray(orders.customerId, waiting), notInArray(orders.status, ["CREATED", "PAYMENT_PENDING", "CANCELLED"])));
    for (const r of rows) {
      const p = progress.get(r.c) ?? { ordered: false, deliveredAt: null, returned: false };
      if (r.status === "RETURNED" || (r.status === "DELIVERED" && !r.kept)) p.returned = true;
      else if (r.status === "DELIVERED" && r.deliveredAt) { if (!p.deliveredAt || r.deliveredAt < p.deliveredAt) p.deliveredAt = r.deliveredAt; }
      else p.ordered = true;
      progress.set(r.c, p);
    }
  }
  const windowMs = returnWindowDays() * DAY;
  return {
    enabled: on,
    unlocked: Boolean(code),
    code,
    rewardPaise: settings.referralRewardPaise,
    expiryDays: settings.expiryDays,
    returnWindowDays: returnWindowDays(),
    earnedPaise: friends.reduce((n, f) => n + (f.status === "GRANTED" ? f.amountPaise ?? 0 : 0), 0),
    friends: friends.map((f) => ({
      name: firstName(f.name),
      joinedAt: f.joinedAt,
      state: f.status === "GRANTED" ? ("REWARDED" as const) : f.status === "BLOCKED" ? ("NOT_ELIGIBLE" as const)
        : progress.get(f.id)?.deliveredAt ? ("DELIVERED" as const) : progress.get(f.id)?.ordered ? ("ORDERED" as const) : progress.get(f.id)?.returned ? ("RETURNED" as const) : ("JOINED" as const),
      /** When the reward is due if the delivered order isn't returned. */
      dueAt: !f.status && progress.get(f.id)?.deliveredAt ? new Date(progress.get(f.id)!.deliveredAt!.getTime() + windowMs) : null,
      reason: f.status === "BLOCKED" ? f.reason : null,
      amountPaise: f.status === "GRANTED" ? f.amountPaise ?? 0 : 0,
      rewardedAt: f.status === "GRANTED" ? f.rewardedAt : null,
    })),
  };
}

const REASONS = {
  SAME_DEVICE: "Same phone or device as the person who invited them.",
  REUSED: "Their mobile number or device was already used for another LOIMART account.",
  NO_ORDER: "The person who invited them has no order of their own.",
  LIMIT: "The referral limit was reached.",
  CLOSED: "The account that invited them is closed.",
} as const;

/** Days after delivery a shopper can ask for a return or replacement (the referral reward waits for it to close). */
export const returnWindowDays = () => Number(process.env.RETURN_WINDOW_DAYS ?? 7) || 7;

/** A delivered order the shopper kept: no return or replacement asked for (except rejected ones) and no parcel sent back. */
export const orderKept = sql`not exists (select 1 from returns r where r.order_id = ${orders.id} and r.status <> 'REJECTED')
  and not exists (select 1 from shipments sh where sh.order_id = ${orders.id} and sh.status = 'RETURNED')`;

/**
 * Daily job: an invited shopper whose order was delivered and kept past the
 * return window (no return or replacement) earns the shopper who invited them
 * the referral reward. Once per invited shopper. Returns how many were paid
 * and refused.
 */
export async function rewardDueCustomerReferrals(db: Db, now = new Date()) {
  const settings = await walletSettings(db);
  const result = { granted: 0, blocked: 0 };
  if (!settings.enabled || !settings.referralEnabled || settings.referralRewardPaise <= 0) return result; // switched off: they're paid once it's back on
  const closedBefore = new Date(now.getTime() - returnWindowDays() * DAY);
  const due = await db.selectDistinctOn([orders.customerId], { orderId: orders.id, customerId: orders.customerId }).from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(sql`${customers.referredByCustomerId} is not null`, eq(orders.status, "DELIVERED"), lte(orders.deliveredAt, closedBefore), orderKept,
      sql`not exists (select 1 from customer_referral_rewards rr where rr.referred_customer_id = ${customers.id})`))
    .orderBy(orders.customerId, asc(orders.deliveredAt)).limit(500);
  for (const row of due) {
    const outcome = await db.transaction((tx) => rewardCustomerReferral(tx, row.orderId));
    if (outcome) result[outcome]++;
  }
  return result;
}

/**
 * Pays the shopper who invited this order's shopper (the order must be
 * delivered and kept past the return window). Never for the same phone or
 * device (a second account of the inviter), only while the inviter has an
 * order of their own, up to Admin's limit. Refused rewards keep the reason.
 */
export async function rewardCustomerReferral(tx: Tx, orderId: string): Promise<"granted" | "blocked" | null> {
  const friend = (await tx.select({ id: customers.id, referredBy: customers.referredByCustomerId, name: customers.fullName }).from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.id, orderId), eq(orders.status, "DELIVERED"), lte(orders.deliveredAt, new Date(Date.now() - returnWindowDays() * DAY)), orderKept)).limit(1))[0];
  if (!friend?.referredBy) return null;
  const referrerId = friend.referredBy;
  // One reward at a time per inviter, so the limit holds when two run together.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"customer_referral:" + referrerId}, 0))`);
  const done = (await tx.select({ id: customerReferralRewards.id }).from(customerReferralRewards).where(eq(customerReferralRewards.referredCustomerId, friend.id)).limit(1))[0];
  if (done) return null;
  const settings = await walletSettings(tx);

  const [referrer, claims, rewarded, referrerOrdered] = await Promise.all([
    tx.select({ status: users.status }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(eq(customers.id, referrerId)).limit(1).then((r) => r[0]),
    tx.select({ customerId: signupBonusClaims.customerId, status: signupBonusClaims.status, deviceId: signupBonusClaims.deviceId, fingerprint: signupBonusClaims.fingerprint, phone: signupBonusClaims.phone })
      .from(signupBonusClaims).where(inArray(signupBonusClaims.customerId, [friend.id, referrerId])),
    tx.select({ n: count() }).from(customerReferralRewards).where(and(eq(customerReferralRewards.referrerCustomerId, referrerId), eq(customerReferralRewards.status, "GRANTED"))).then((r) => Number(r[0]?.n ?? 0)),
    hasPlacedOrder(tx, referrerId),
  ]);
  const mine = claims.filter((c) => c.customerId === referrerId), theirs = claims.filter((c) => c.customerId === friend.id);
  const overlap = theirs.some((t) => mine.some((m) => (t.deviceId && t.deviceId === m.deviceId) || (t.fingerprint && t.fingerprint === m.fingerprint) || t.phone === m.phone));
  const reused = theirs.length > 0 && !theirs.some((t) => t.status === "GRANTED");
  const blocked = !referrer || referrer.status !== "ACTIVE" ? REASONS.CLOSED
    : overlap ? REASONS.SAME_DEVICE
    : reused ? REASONS.REUSED
    : !referrerOrdered ? REASONS.NO_ORDER
    : settings.maxReferralRewards > 0 && rewarded >= settings.maxReferralRewards ? REASONS.LIMIT
    : null;
  if (blocked) {
    await tx.insert(customerReferralRewards).values({ referrerCustomerId: referrerId, referredCustomerId: friend.id, orderId, status: "BLOCKED", reason: blocked });
    return "blocked";
  }
  const amount = settings.referralRewardPaise;
  const [entry] = await tx.insert(customerWalletEntries).values({
    customerId: referrerId, kind: "REFERRAL_REWARD", amountPaise: amount, remainingPaise: amount,
    expiresAt: new Date(Date.now() + settings.expiryDays * DAY), note: `Referral reward: ${firstName(friend.name)}'s first order was delivered and kept`,
  }).returning({ id: customerWalletEntries.id });
  await tx.insert(customerReferralRewards).values({ referrerCustomerId: referrerId, referredCustomerId: friend.id, orderId, status: "GRANTED", amountPaise: amount, walletEntryId: entry!.id });
  return "granted";
}

/** At sign-up: link the new shopper to whoever invited them (a wrong code is an error the form can show). */
export async function referrerForSignup(db: Exec, code: string | undefined | null): Promise<string | null> {
  if (!code?.trim()) return null;
  const referrer = await findCustomerReferrer(db, code);
  if (!referrer) throw new AppError("UNPROCESSABLE", "That referral code isn't valid. Check it, or leave it empty.");
  return referrer.id;
}
