import { adCampaigns, auditLogs } from "@azadimart/database";
import { AppError, adCampaignSchema, toApiError, uuidSchema } from "@azadimart/shared";
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
    await checkAdContent(db, sellerId, userId, input);
    const [campaign] = await db.update(adCampaigns).set({ productId: input.productId, headline: input.headline, desktopImageAssetId: input.desktopImageAssetId, mobileImageAssetId: input.mobileImageAssetId, status: "PENDING_REVIEW", reviewNote: null, updatedAt: new Date() })
      .where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.sellerId, sellerId), eq(adCampaigns.slotId, input.slotId))).returning();
    if (!campaign) throw new AppError("NOT_FOUND", "Ad not found");
    await db.insert(auditLogs).values({ actorUserId: userId, action: "AD_UPDATED", entityType: "ad_campaign", entityId: campaignId, metadata: {} });
    return NextResponse.json({ campaign });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
