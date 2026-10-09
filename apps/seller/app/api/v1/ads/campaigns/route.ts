import { adCampaigns, adSlots, auditLogs } from "@azadimart/database";
import { AppError, adCampaignSchema, adNeedsBanner, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdSeller } from "../seller";
import { checkAdContent } from "./check";

/** Create an ad (product + banner + headline) for an ad space. AzadiMart reviews it before it runs. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, sellerId, userId } = await requireAdSeller(request);
    const input = adCampaignSchema.parse(await request.json());
    const slot = (await db.select({ id: adSlots.id, placement: adSlots.placement }).from(adSlots).where(and(eq(adSlots.id, input.slotId), eq(adSlots.isActive, true))).limit(1))[0];
    if (!slot) throw new AppError("NOT_FOUND", "Ad space not found");
    await checkAdContent(db, sellerId, userId, input, slot.placement);
    const banners = adNeedsBanner(slot.placement) ? { desktopImageAssetId: input.desktopImageAssetId, mobileImageAssetId: input.mobileImageAssetId } : { desktopImageAssetId: null, mobileImageAssetId: null };
    const [campaign] = await db.insert(adCampaigns).values({ ...input, ...banners, sellerId, status: "PENDING_REVIEW" }).returning();
    await db.insert(auditLogs).values({ actorUserId: userId, action: "AD_CREATED", entityType: "ad_campaign", entityId: campaign!.id, metadata: { slotId: input.slotId, productId: input.productId } });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
