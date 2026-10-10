import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, payouts, sellerBankAccounts, sellers, unpaidSettlementLines } from "@azadimart/database";
import { AppError, COMMISSION_RATE_BPS, PAYOUT_HOLD_DAYS, commissionFreeUntil, toApiError } from "@azadimart/shared";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The seller's money: bank account, commission status, upcoming earnings and payouts sent. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const sellerId = principal.sellerId;
    const db = createDatabase();
    const [seller, bank, sent, lines] = await Promise.all([
      db.select({ approvedAt: sellers.approvedAt, holdReason: sellers.payoutHoldReason }).from(sellers).where(eq(sellers.id, sellerId)).limit(1).then((r) => r[0]),
      db.select({ accountHolderName: sellerBankAccounts.accountHolderName, last4: sellerBankAccounts.accountNumberLast4, ifsc: sellerBankAccounts.ifsc, status: sellerBankAccounts.verificationStatus, rejectionReason: sellerBankAccounts.rejectionReason })
        .from(sellerBankAccounts).where(and(eq(sellerBankAccounts.sellerId, sellerId), eq(sellerBankAccounts.isPrimary, true))).limit(1).then((r) => r[0] ?? null),
      db.select({ id: payouts.id, status: payouts.status, amountPaise: payouts.amountPaise, grossPaise: payouts.grossPaise, deductionsPaise: payouts.deductionsPaise, itemCount: payouts.itemCount, utr: payouts.utr, mode: payouts.mode, failureReason: payouts.failureReason, paidAt: payouts.paidAt, createdAt: payouts.createdAt })
        .from(payouts).where(eq(payouts.sellerId, sellerId)).orderBy(desc(payouts.createdAt)).limit(100),
      unpaidSettlementLines(db, { sellerId }),
    ]);
    const freeUntil = seller?.approvedAt ? commissionFreeUntil(seller.approvedAt) : null;
    const now = Date.now();
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    // Statuses a seller sees: what's sent, what's on its way and what's waiting.
    const waiting = sent.filter((p) => p.status !== "PAID");
    return NextResponse.json({
      bankAccount: bank,
      holdReason: seller?.holdReason ?? null,
      commission: { freeUntil, isFreeNow: !freeUntil || freeUntil.getTime() > now, rateBps: COMMISSION_RATE_BPS, holdDays: PAYOUT_HOLD_DAYS },
      summary: {
        paid30dPaise: sent.filter((p) => p.status === "PAID" && p.paidAt && p.paidAt.getTime() > monthAgo).reduce((s, p) => s + p.amountPaise, 0),
        waitingPaise: waiting.reduce((s, p) => s + p.amountPaise, 0),
        upcomingPaise: lines.filter((l) => !l.openReturn).reduce((s, l) => s + l.breakdown.netPaise, 0),
        heldByReturnsPaise: lines.filter((l) => l.openReturn).reduce((s, l) => s + l.breakdown.netPaise, 0),
        nextPayoutAt: lines.filter((l) => !l.openReturn).map((l) => l.eligibleAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
      },
      upcoming: lines.map((l) => ({ orderNumber: l.orderNumber, title: l.title, quantity: l.quantity, deliveredAt: l.deliveredAt, eligibleAt: l.eligibleAt, openReturn: l.openReturn, ...l.breakdown })),
      payouts: sent,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
