import { requireApiAccess } from "@azadimart/auth";
import { adCampaigns, adSlots, createDatabase, mediaAssets, products, sellers } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Seller ads for review (newest first; waiting ones on top). */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    const desktop = alias(mediaAssets, "desktop"), mobile = alias(mediaAssets, "mobile");
    const items = await db.select({
      id: adCampaigns.id, status: adCampaigns.status, headline: adCampaigns.headline, reviewNote: adCampaigns.reviewNote, createdAt: adCampaigns.createdAt, updatedAt: adCampaigns.updatedAt,
      storeName: sellers.storeName, slotName: adSlots.name, productTitle: products.title, productSlug: products.slug, productStatus: products.status,
      desktopKey: desktop.storageKey, mobileKey: mobile.storageKey,
      bookedDays: sql<number>`(select count(*)::int from ad_bids b where b.campaign_id = ${adCampaigns.id} and b.status = 'WON')`,
    }).from(adCampaigns).innerJoin(sellers, eq(sellers.id, adCampaigns.sellerId)).innerJoin(adSlots, eq(adSlots.id, adCampaigns.slotId))
      .innerJoin(products, eq(products.id, adCampaigns.productId)).innerJoin(desktop, eq(desktop.id, adCampaigns.desktopImageAssetId)).leftJoin(mobile, eq(mobile.id, adCampaigns.mobileImageAssetId))
      .orderBy(sql`${adCampaigns.status} = 'PENDING_REVIEW' desc`, desc(adCampaigns.updatedAt)).limit(200);
    return NextResponse.json({ items: items.map(({ desktopKey, mobileKey, ...c }) => ({ ...c, desktopImageUrl: "/media/" + desktopKey, mobileImageUrl: mobileKey ? "/media/" + mobileKey : null })) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
