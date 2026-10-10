import { enforceRateLimit } from "@azadimart/auth";
import { auditLogs, placeAdBids } from "@azadimart/database";
import { notifyAdEvents } from "@azadimart/notify";
import { adBidSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { requireAdSeller } from "../seller";

/** Bid on (or book instantly) one or more days. Each day succeeds or fails on its own. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, sellerId, userId } = await requireAdSeller(request);
    const input = adBidSchema.parse(await request.json());
    await enforceRateLimit(db, request, "adBid", { subject: userId, rule: { limit: 60, windowSeconds: 60 * 60 } });
    const { results, events } = await placeAdBids(db, { sellerId, campaignId: input.campaignId, days: input.days, mode: input.mode, amountPaise: input.amountPaise });
    await notifyAdEvents(db, events);
    const ok = results.filter((r) => r.ok);
    if (ok.length) await db.insert(auditLogs).values({ actorUserId: userId, action: input.mode === "BUY_NOW" ? "AD_BOOKED" : "AD_BID", entityType: "ad_campaign", entityId: input.campaignId, metadata: { days: ok.map((r) => r.day), amountPaise: ok[0]!.amountPaise } });
    return NextResponse.json({ results }, { status: ok.length ? 200 : 409 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
