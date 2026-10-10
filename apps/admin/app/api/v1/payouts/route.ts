import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, payoutItems, payouts, sellerBankAccounts, sellers, unpaidSettlementLines } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { desc, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { dailyLimitPaise, payoutRail } from "../../../lib/payouts";

export const dynamic = "force-dynamic";

/** Finance overview: payouts, what's coming up, and AzadiMart's commission and tax collected. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [items, lines, totals] = await Promise.all([
      db.select({
        id: payouts.id, sellerId: payouts.sellerId, storeName: sellers.storeName, status: payouts.status, amountPaise: payouts.amountPaise,
        grossPaise: payouts.grossPaise, deductionsPaise: payouts.deductionsPaise, itemCount: payouts.itemCount, reference: payouts.reference,
        mode: payouts.mode, utr: payouts.utr, attempts: payouts.attempts, failureReason: payouts.failureReason,
        initiatedAt: payouts.initiatedAt, paidAt: payouts.paidAt, createdAt: payouts.createdAt, accountLast4: sellerBankAccounts.accountNumberLast4,
      }).from(payouts).innerJoin(sellers, eq(sellers.id, payouts.sellerId)).leftJoin(sellerBankAccounts, eq(sellerBankAccounts.id, payouts.bankAccountId))
        .orderBy(desc(payouts.createdAt)).limit(200),
      unpaidSettlementLines(db),
      db.select({
        paid: sql<number>`coalesce(sum(${payoutItems.netAmountPaise}) filter (where ${payouts.status} = 'PAID'), 0)::int`,
        commission: sql<number>`coalesce(sum(${payoutItems.commissionPaise} + ${payoutItems.gstOnCommissionPaise}), 0)::int`,
        tcs: sql<number>`coalesce(sum(${payoutItems.tcsPaise}), 0)::int`,
        tds: sql<number>`coalesce(sum(${payoutItems.tdsPaise}), 0)::int`,
      }).from(payoutItems).innerJoin(payouts, eq(payouts.id, payoutItems.payoutId)).where(gte(payouts.createdAt, monthAgo)),
    ]);
    const now = Date.now();
    const sum = (list: typeof lines) => list.reduce((s, l) => s + l.breakdown.netPaise, 0);
    const inWindow = lines.filter((l) => l.eligibleAt.getTime() > now && !l.openReturn);
    return NextResponse.json({
      mode: payoutRail()?.mode ?? "NOT_SET_UP",
      dailyLimitPaise: dailyLimitPaise(),
      summary: {
        paid30dPaise: totals[0]?.paid ?? 0,
        commission30dPaise: totals[0]?.commission ?? 0,
        tcs30dPaise: totals[0]?.tcs ?? 0,
        tds30dPaise: totals[0]?.tds ?? 0,
        inReturnWindowPaise: sum(inWindow),
        inReturnWindowItems: inWindow.length,
        heldByReturnsPaise: sum(lines.filter((l) => l.openReturn)),
        needsAttention: items.filter((p) => p.status === "ON_HOLD" || p.status === "FAILED" || (p.status === "PENDING" && p.failureReason)).length,
      },
      items,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
