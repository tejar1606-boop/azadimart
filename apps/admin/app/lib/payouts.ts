import { decryptSecret } from "@azadimart/auth";
import { auditLogs, payoutItems, payouts, sellerBankAccounts, sellers, unpaidSettlementLines, type Database, type SettlementLine } from "@azadimart/database";
import { notifySeller } from "@azadimart/notify";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

/**
 * Automatic seller payouts, from AzadiMart's own current account.
 *
 * Every day: order items delivered 7+ days ago, paid, with no open return
 * are grouped per seller into a payout (commission etc. fixed per item), and
 * each payout is sent to the seller's verified bank account. Payouts are held
 * (not sent) when the seller is on hold or not active, or has no verified
 * bank account; above the daily limit they wait for an admin's approval.
 * Failed transfers are retried with the same reference, so a seller is
 * never paid twice.
 */

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const MAX_ATTEMPTS = 3;
export const dailyLimitPaise = () => Number(process.env.PAYOUT_DAILY_LIMIT_PAISE) || 2_00_000_00; // ₹2 lakh

type Transfer = { reference: string; amountPaise: number; accountHolderName: string; accountNumber: string; ifsc: string; narration: string };
type TransferResult =
  | { status: "PAID"; utr: string; providerRef: string }
  | { status: "PROCESSING"; providerRef: string }
  | { status: "FAILED"; reason: string; badAccount?: boolean };
type PayoutRail = { mode: "TEST" | "LIVE"; send(transfer: Transfer): Promise<TransferResult> };

/** Test mode: nothing leaves the bank. Accounts ending 0000 are treated as closed, to try the failure path. */
const testRail: PayoutRail = {
  mode: "TEST",
  async send(t) {
    if (t.accountNumber.endsWith("0000")) return { status: "FAILED", reason: "Beneficiary account closed (test)", badAccount: true };
    return { status: "PAID", utr: "TEST" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000), providerRef: "test_" + t.reference };
  },
};

/**
 * The connection to AzadiMart's bank. Only test mode exists until the bank's
 * payout API (or a payout service linked to the current account) is set up,
 * and test mode is refused on the live site so nothing is marked paid falsely.
 */
export function payoutRail(): PayoutRail | null {
  const chosen = process.env.PAYOUT_PROVIDER || "test";
  if (chosen === "test" && process.env.VERCEL_ENV !== "production") return testRail;
  return null;
}

function startOfIndianDay(now: Date) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
}

/** Groups items that are ready into one payout per seller. Safe to run repeatedly: an item can only be in one payout. */
export async function createDuePayouts(db: Database, now = new Date()) {
  const due = (await unpaidSettlementLines(db)).filter((line) => line.eligibleAt <= now && !line.openReturn);
  const bySeller = new Map<string, SettlementLine[]>();
  for (const line of due) bySeller.set(line.sellerId, [...(bySeller.get(line.sellerId) ?? []), line]);
  let created = 0;
  for (const [sellerId, lines] of bySeller) {
    const net = lines.reduce((sum, l) => sum + l.breakdown.netPaise, 0);
    if (net <= 0) continue;
    try {
      await db.transaction(async (tx) => {
        const [payout] = await tx.insert(payouts).values({
          sellerId, status: "PENDING", amountPaise: net,
          grossPaise: lines.reduce((sum, l) => sum + l.breakdown.grossPaise, 0),
          deductionsPaise: lines.reduce((sum, l) => sum + l.breakdown.grossPaise - l.breakdown.netPaise, 0),
          itemCount: lines.length, mode: payoutRail()?.mode ?? "LIVE",
          reference: "AZMPO" + now.getTime().toString(36).toUpperCase() + crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
        }).returning({ id: payouts.id });
        await tx.insert(payoutItems).values(lines.map((l) => ({
          payoutId: payout!.id, orderItemId: l.orderItemId, quantity: l.quantity,
          grossAmountPaise: l.breakdown.grossPaise, deductionsPaise: l.breakdown.grossPaise - l.breakdown.netPaise, netAmountPaise: l.breakdown.netPaise,
          commissionRateBps: l.breakdown.commissionRateBps, commissionPaise: l.breakdown.commissionPaise,
          gstOnCommissionPaise: l.breakdown.gstOnCommissionPaise, tcsPaise: l.breakdown.tcsPaise, tdsPaise: l.breakdown.tdsPaise,
        })));
      });
      created++;
    } catch {
      // Another run took these items first (unique order item): nothing to do.
    }
  }
  return created;
}

type Outcome = "PAID" | "PROCESSING" | "ON_HOLD" | "WAITING_APPROVAL" | "FAILED" | "NOT_SET_UP" | "SKIPPED";

/** Tries to send one payout. */
export async function processPayout(db: Database, payoutId: string, options: { approvedByUserId?: string; now?: Date } = {}): Promise<Outcome> {
  const now = options.now ?? new Date();
  const payout = (await db.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1))[0];
  if (!payout || payout.status === "PAID" || payout.status === "PROCESSING") return "SKIPPED";
  if (payout.status === "FAILED" && payout.attempts >= MAX_ATTEMPTS && !options.approvedByUserId) return "SKIPPED";

  const seller = (await db.select({ status: sellers.status, holdReason: sellers.payoutHoldReason, storeName: sellers.storeName }).from(sellers).where(eq(sellers.id, payout.sellerId)).limit(1))[0];
  const account = (await db.select().from(sellerBankAccounts)
    .where(and(eq(sellerBankAccounts.sellerId, payout.sellerId), eq(sellerBankAccounts.isPrimary, true))).limit(1))[0];
  const hold = async (reason: string) => {
    const changed = payout.status !== "ON_HOLD" || payout.failureReason !== reason;
    await db.update(payouts).set({ status: "ON_HOLD", failureReason: reason, updatedAt: now }).where(eq(payouts.id, payoutId));
    if (changed) await notifySeller(db, { sellerId: payout.sellerId, kind: "PAYOUT_ON_HOLD", dedupeKey: `PAYOUT_HOLD:${payoutId}:${reason}`, href: "/payouts", title: `Payment of ${money(payout.amountPaise)} is on hold`, body: reason });
    return "ON_HOLD" as const;
  };
  if (!seller) return "SKIPPED";
  if (seller.holdReason) return hold(`Held by AzadiMart: ${seller.holdReason}`);
  if (seller.status !== "ACTIVE") return hold("Your seller account isn't active.");
  if (!account) return hold("Add your bank account in Payments to receive this money.");
  if (account.verificationStatus === "PENDING") return hold("Your bank account is being verified by AzadiMart.");
  if (account.verificationStatus === "REJECTED") return hold(`Your bank account was rejected${account.rejectionReason ? `: ${account.rejectionReason}` : ""}. Add a correct account in Payments.`);

  const rail = payoutRail();
  if (!rail) {
    await db.update(payouts).set({ status: "PENDING", failureReason: "Waiting for AzadiMart's bank connection to be set up.", updatedAt: now }).where(eq(payouts.id, payoutId));
    return "NOT_SET_UP";
  }

  // Daily safety limit: bigger totals wait for an admin to approve.
  const approvedBy = options.approvedByUserId ?? payout.approvedByUserId;
  if (!approvedBy) {
    const sent = (await db.select({ total: sql<number>`coalesce(sum(${payouts.amountPaise}), 0)::int` }).from(payouts)
      .where(and(inArray(payouts.status, ["PROCESSING", "PAID"]), gte(payouts.initiatedAt, startOfIndianDay(now)))))[0]?.total ?? 0;
    if (sent + payout.amountPaise > dailyLimitPaise()) {
      await db.update(payouts).set({ status: "PENDING", failureReason: `Waiting for admin approval: over the daily limit of ${money(dailyLimitPaise())}.`, updatedAt: now }).where(eq(payouts.id, payoutId));
      return "WAITING_APPROVAL";
    }
  }

  // Claim it atomically so two runs can't send the same payout.
  const claimed = (await db.update(payouts).set({
    status: "PROCESSING", attempts: sql`${payouts.attempts} + 1`, initiatedAt: now, bankAccountId: account.id, mode: rail.mode,
    approvedByUserId: approvedBy ?? null, failureReason: null, updatedAt: now,
  }).where(and(eq(payouts.id, payoutId), inArray(payouts.status, ["PENDING", "FAILED", "ON_HOLD"]))).returning({ id: payouts.id }))[0];
  if (!claimed) return "SKIPPED";

  let result: TransferResult;
  try {
    result = await rail.send({ reference: payout.reference!, amountPaise: payout.amountPaise, accountHolderName: account.accountHolderName, accountNumber: decryptSecret(account.accountNumberEncrypted), ifsc: account.ifsc, narration: `AzadiMart payout ${payout.reference}` });
  } catch (error) {
    result = { status: "FAILED", reason: error instanceof Error ? error.message : "Transfer failed" };
  }

  if (result.status === "PAID") {
    await db.update(payouts).set({ status: "PAID", utr: result.utr, providerRef: result.providerRef, paidAt: new Date(), updatedAt: new Date() }).where(eq(payouts.id, payoutId));
    await db.insert(auditLogs).values({ actorUserId: approvedBy ?? null, action: "PAYOUT_PAID", entityType: "payout", entityId: payoutId, metadata: { sellerId: payout.sellerId, amountPaise: payout.amountPaise, utr: result.utr, mode: rail.mode } });
    await notifySeller(db, { sellerId: payout.sellerId, kind: "PAYOUT_PAID", dedupeKey: `PAYOUT_PAID:${payoutId}`, href: "/payouts", title: `${money(payout.amountPaise)} sent to your bank`, body: `For ${payout.itemCount} order item${payout.itemCount === 1 ? "" : "s"} · to account ending ${account.accountNumberLast4} · UTR ${result.utr}${rail.mode === "TEST" ? " (test mode, no money moved)" : ""}.` });
    return "PAID";
  }
  if (result.status === "PROCESSING") {
    await db.update(payouts).set({ providerRef: result.providerRef, updatedAt: new Date() }).where(eq(payouts.id, payoutId));
    return "PROCESSING";
  }
  if (result.badAccount) {
    await db.update(sellerBankAccounts).set({ verificationStatus: "REJECTED", rejectionReason: result.reason, updatedAt: new Date() }).where(eq(sellerBankAccounts.id, account.id));
    await db.update(payouts).set({ status: "FAILED", failureReason: result.reason, updatedAt: new Date() }).where(eq(payouts.id, payoutId));
    return hold(`Your bank rejected the transfer (${result.reason}). Add a correct account in Payments.`);
  }
  await db.update(payouts).set({ status: "FAILED", failureReason: result.reason, updatedAt: new Date() }).where(eq(payouts.id, payoutId));
  return "FAILED";
}

/** The daily job: create due payouts, then send everything that's waiting. */
export async function runPayouts(db: Database, now = new Date()) {
  const created = await createDuePayouts(db, now);
  const waiting = await db.select({ id: payouts.id }).from(payouts).where(inArray(payouts.status, ["PENDING", "FAILED", "ON_HOLD"])).orderBy(payouts.createdAt);
  const summary: Record<Outcome, number> & { created: number } = { created, PAID: 0, PROCESSING: 0, ON_HOLD: 0, WAITING_APPROVAL: 0, FAILED: 0, NOT_SET_UP: 0, SKIPPED: 0 };
  for (const { id } of waiting) summary[await processPayout(db, id, { now })]++;
  return summary;
}
