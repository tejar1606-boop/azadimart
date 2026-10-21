import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, ensureReferralCode, sellerCommissionFreePeriods, sellers } from "@azadimart/database";
import { AppError, REFERRAL_BONUS_MONTHS, REFERRAL_MAX_REWARDS, commissionFreeUntil, toApiError } from "@azadimart/shared";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Refer & earn: this seller's code and link, free months earned, and how each referred seller is doing. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const db = createDatabase();
    const sellerId = principal.sellerId;
    const code = await ensureReferralCode(db, sellerId);
    const [me, periods, referred] = await Promise.all([
      db.select({ approvedAt: sellers.approvedAt }).from(sellers).where(eq(sellers.id, sellerId)).limit(1).then((r) => r[0]),
      db.select({ startsAt: sellerCommissionFreePeriods.startsAt, endsAt: sellerCommissionFreePeriods.endsAt, referredSellerId: sellerCommissionFreePeriods.referredSellerId })
        .from(sellerCommissionFreePeriods).where(and(eq(sellerCommissionFreePeriods.sellerId, sellerId), eq(sellerCommissionFreePeriods.reason, "REFERRAL"))),
      db.select({ id: sellers.id, storeName: sellers.storeName, status: sellers.status, createdAt: sellers.createdAt, rewardedAt: sellers.referralRewardedAt })
        .from(sellers).where(eq(sellers.referredBySellerId, sellerId)).orderBy(desc(sellers.createdAt)).limit(200),
    ]);
    const firstFreeEnds = me?.approvedAt ? commissionFreeUntil(me.approvedAt) : null;
    const ends = [firstFreeEnds, ...periods.map((p) => p.endsAt)].filter((d): d is Date => Boolean(d));
    const freeUntil = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
    // The share link points at this Seller Centre's own address (works through any domain or tunnel).
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    return NextResponse.json({
      code, link: `${proto}://${host}/register?ref=${code}`,
      bonusMonths: REFERRAL_BONUS_MONTHS, maxRewards: REFERRAL_MAX_REWARDS,
      earned: periods.length, remaining: Math.max(0, REFERRAL_MAX_REWARDS - periods.length),
      freeUntil: freeUntil?.toISOString() ?? null, firstFreeEnds: firstFreeEnds?.toISOString() ?? null,
      referrals: referred.map((r) => {
        const period = periods.find((p) => p.referredSellerId === r.id);
        const stage = period ? "REWARDED" : r.rewardedAt ? "NOT_COUNTED" : r.status === "ACTIVE" ? "APPROVED" : r.status === "SUSPENDED" || r.status === "REJECTED" ? "CLOSED" : "SIGNED_UP";
        return { storeName: r.storeName, joinedAt: r.createdAt, stage, freeFrom: period?.startsAt ?? null, freeTo: period?.endsAt ?? null };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
