import { adBids, adBudget, adCampaigns, adSlots, categories, mediaAssets, payouts, products, sellerCharges } from "@azadimart/database";
import { settleAdAuctions } from "@azadimart/notify";
import { AD_PLACEMENT_LABELS, istDayKey, toApiError, type AdPlacement } from "@azadimart/shared";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { requireAdSeller } from "./seller";

export const dynamic = "force-dynamic";

/** Everything for the seller's Ads page: ad spaces and prices, their ads, bookings and bids, results and charges. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, sellerId } = await requireAdSeller(request);
    await settleAdAuctions(db);
    const desktop = alias(mediaAssets, "desktop"), mobile = alias(mediaAssets, "mobile");
    const [slots, campaigns, bids, charges, budget] = await Promise.all([
      db.select({ id: adSlots.id, name: adSlots.name, placement: adSlots.placement, categoryName: categories.name, description: adSlots.description, basePricePaise: adSlots.basePricePaise, buyNowPricePaise: adSlots.buyNowPricePaise, bidIncrementPaise: adSlots.bidIncrementPaise, closeHoursBefore: adSlots.closeHoursBefore })
        .from(adSlots).leftJoin(categories, eq(categories.id, adSlots.categoryId)).where(eq(adSlots.isActive, true)).orderBy(asc(adSlots.createdAt)),
      db.select({ id: adCampaigns.id, slotId: adCampaigns.slotId, productId: adCampaigns.productId, productTitle: products.title, headline: adCampaigns.headline, status: adCampaigns.status, reviewNote: adCampaigns.reviewNote,
        desktopImageAssetId: adCampaigns.desktopImageAssetId, mobileImageAssetId: adCampaigns.mobileImageAssetId, desktopKey: desktop.storageKey, mobileKey: mobile.storageKey })
        .from(adCampaigns).innerJoin(products, eq(products.id, adCampaigns.productId)).leftJoin(desktop, eq(desktop.id, adCampaigns.desktopImageAssetId)).leftJoin(mobile, eq(mobile.id, adCampaigns.mobileImageAssetId))
        .where(eq(adCampaigns.sellerId, sellerId)).orderBy(desc(adCampaigns.updatedAt)),
      db.select({ id: adBids.id, slotId: adBids.slotId, slotName: adSlots.name, campaignId: adBids.campaignId, day: adBids.day, amountPaise: adBids.amountPaise, kind: adBids.kind, status: adBids.status, impressions: adBids.impressions, clicks: adBids.clicks })
        .from(adBids).innerJoin(adSlots, eq(adSlots.id, adBids.slotId)).where(and(eq(adBids.sellerId, sellerId), gte(adBids.day, istDayKey(new Date(Date.now() - 60 * 864e5))), inArray(adBids.status, ["ACTIVE", "OUTBID", "WON", "LOST", "CANCELLED"])))
        .orderBy(desc(adBids.day)).limit(300),
      // Each charge with the ad day it was for, its results, and the payment it was taken from.
      db.select({ id: sellerCharges.id, description: sellerCharges.description, basePaise: sellerCharges.basePaise, gstPaise: sellerCharges.gstPaise, amountPaise: sellerCharges.amountPaise, status: sellerCharges.status, createdAt: sellerCharges.createdAt,
        day: adBids.day, slotName: adSlots.name, impressions: adBids.impressions, clicks: adBids.clicks, paidAt: payouts.paidAt })
        .from(sellerCharges).leftJoin(adBids, eq(adBids.id, sellerCharges.referenceId)).leftJoin(adSlots, eq(adSlots.id, adBids.slotId)).leftJoin(payouts, eq(payouts.id, sellerCharges.payoutId))
        .where(eq(sellerCharges.sellerId, sellerId)).orderBy(desc(sellerCharges.createdAt)).limit(100),
      adBudget(db, sellerId),
    ]);
    // A seller may have bid several times on a day; show their best/latest state per day.
    const seen = new Set<string>();
    const myDays = bids.sort((a, b) => b.amountPaise - a.amountPaise).filter((b) => { const k = b.slotId + b.day; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.day.localeCompare(a.day));
    const won = bids.filter((b) => b.status === "WON");
    return NextResponse.json({
      today: istDayKey(),
      slots: slots.map((s) => ({ ...s, placementLabel: AD_PLACEMENT_LABELS[s.placement as AdPlacement] ?? s.placement })),
      campaigns: campaigns.map(({ desktopKey, mobileKey, ...c }) => ({ ...c, desktopImageUrl: desktopKey ? "/media/" + desktopKey : null, mobileImageUrl: mobileKey ? "/media/" + mobileKey : null })),
      bids: myDays,
      charges,
      budget,
      totals: {
        impressions: won.reduce((s, b) => s + b.impressions, 0),
        clicks: won.reduce((s, b) => s + b.clicks, 0),
        pendingChargesPaise: charges.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.amountPaise, 0),
      },
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
