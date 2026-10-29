import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, ensureReferralCode, sellerAdCredits, sellers } from "@azadimart/database";
import { AppError, REFERRAL_MAX_REWARDS, toApiError } from "@azadimart/shared";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Refer & earn: this seller's code and link, free ad days earned, and how each referred seller is doing. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const db = createDatabase();
    const sellerId = principal.sellerId;
    const code = await ensureReferralCode(db, sellerId);
    const [credits, referred] = await Promise.all([
      db.select({ referredSellerId: sellerAdCredits.referredSellerId, status: sellerAdCredits.status }).from(sellerAdCredits)
        .where(and(eq(sellerAdCredits.sellerId, sellerId), eq(sellerAdCredits.reason, "REFERRAL"))),
      db.select({ id: sellers.id, storeName: sellers.storeName, status: sellers.status, createdAt: sellers.createdAt, rewardedAt: sellers.referralRewardedAt })
        .from(sellers).where(eq(sellers.referredBySellerId, sellerId)).orderBy(desc(sellers.createdAt)).limit(200),
    ]);
    // The share link points at this Seller Centre's own address (works through any domain or tunnel).
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    return NextResponse.json({
      code, link: `${proto}://${host}/register?ref=${code}`,
      maxRewards: REFERRAL_MAX_REWARDS,
      earned: credits.length, available: credits.filter((c) => c.status === "AVAILABLE").length, remaining: Math.max(0, REFERRAL_MAX_REWARDS - credits.length),
      referrals: referred.map((r) => {
        const credit = credits.find((c) => c.referredSellerId === r.id);
        const stage = credit ? "REWARDED" : r.rewardedAt ? "NOT_COUNTED" : r.status === "ACTIVE" ? "APPROVED" : r.status === "SUSPENDED" || r.status === "REJECTED" ? "CLOSED" : "SIGNED_UP";
        return { storeName: r.storeName, joinedAt: r.createdAt, stage, used: credit?.status === "USED" };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
