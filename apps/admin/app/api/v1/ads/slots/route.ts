import { requireApiAccess } from "@azadimart/auth";
import { adBids, adCampaigns, adSlots, auditLogs, categories, createDatabase, sellers } from "@azadimart/database";
import { settleAdAuctions } from "@azadimart/notify";
import { adSlotSchema, istDayKey, toApiError } from "@azadimart/shared";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Ad spaces with their prices, plus upcoming bookings and ads waiting for review. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    await settleAdAuctions(db);
    const [slots, bookings, pending] = await Promise.all([
      db.select({ slot: adSlots, categoryName: categories.name }).from(adSlots).leftJoin(categories, eq(categories.id, adSlots.categoryId)).orderBy(asc(adSlots.createdAt))
        .then((rows) => rows.map((r) => ({ ...r.slot, categoryName: r.categoryName }))),
      db.select({ id: adBids.id, slotId: adBids.slotId, day: adBids.day, amountPaise: adBids.amountPaise, kind: adBids.kind, status: adBids.status, impressions: adBids.impressions, clicks: adBids.clicks, storeName: sellers.storeName, headline: adCampaigns.headline, campaignStatus: adCampaigns.status })
        .from(adBids).innerJoin(sellers, eq(sellers.id, adBids.sellerId)).innerJoin(adCampaigns, eq(adCampaigns.id, adBids.campaignId))
        .where(and(inArray(adBids.status, ["WON", "ACTIVE"]), gte(adBids.day, istDayKey(new Date(Date.now() - 30 * 864e5))))).orderBy(desc(adBids.day)).limit(300),
      db.select({ id: adCampaigns.id }).from(adCampaigns).where(eq(adCampaigns.status, "PENDING_REVIEW")),
    ]);
    return NextResponse.json({ slots, bookings, pendingReview: pending.length });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = adSlotSchema.parse(await request.json());
    const db = createDatabase();
    const [slot] = await db.insert(adSlots).values({ ...input, buyNowPricePaise: input.buyNowPricePaise ?? null }).returning();
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "AD_SLOT_CREATED", entityType: "ad_slot", entityId: slot!.id, metadata: input });
    return NextResponse.json({ slot }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
