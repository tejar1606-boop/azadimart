import { adCampaigns, adSlots, auditLogs } from "@azadimart/database";
import { AppError, adCampaignSchema, adNeedsBanner, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdSeller } from "../../seller";
import { checkAdContent } from "../check";

/** Edit an ad. Any change goes back to AzadiMart for review. The ad space can't change once created. */
export async function PUT(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { db, sellerId, userId } = await requireAdSeller(request);
    const { campaignId } = await params;
    if (!uuidSchema.safeParse(campaignId).success) throw new AppError("NOT_FOUND", "Ad not found");
    const input = adCampaignSchema.parse(await request.json());
    const slot = (await db.select({ placement: adSlots.placement }).from(adSlots).where(eq(adSlots.id, input.slotId)).limit(1))[0];
    if (!slot) throw new AppError("NOT_FOUND", "Ad space not found");
    await checkAdContent(db, sellerId, userId, input, slot.placement);
    const banner = adNeedsBanner(slot.placement);
    const [campaign] = await db.update(adCampaigns).set({ productId: input.productId, headline: input.headline, desktopImageAssetId: banner ? input.desktopImageAssetId : null, mobileImageAssetId: banner ? input.mobileImageAssetId : null, status: "PENDING_REVIEW", reviewNote: null, updatedAt: new Date() })
      .where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.sellerId, sellerId), eq(adCampaigns.slotId, input.slotId))).returning();
    if (!campaign) throw new AppError("NOT_FOUND", "Ad not found");
    await db.insert(auditLogs).values({ actorUserId: userId, action: "AD_UPDATED", entityType: "ad_campaign", entityId: campaignId, metadata: {} });
    return NextResponse.json({ campaign });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
