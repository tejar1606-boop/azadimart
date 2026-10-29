import { enforceRateLimit } from "@azadimart/auth";
import { adBids, adCampaigns, createDatabase, products } from "@azadimart/database";
import { istDayKey, uuidSchema } from "@azadimart/shared";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** A shopper clicked a sponsored banner: count it and go to the advertised product. */
export async function GET(request: Request, { params }: { params: Promise<{ bidId: string }> }) {
  const { bidId } = await params;
  const home = new URL("/", request.url);
  if (!uuidSchema.safeParse(bidId).success) return NextResponse.redirect(home);
  const db = createDatabase();
  const ad = (await db.select({ slug: products.slug, status: products.status, day: adBids.day, bidStatus: adBids.status })
    .from(adBids).innerJoin(adCampaigns, eq(adCampaigns.id, adBids.campaignId)).innerJoin(products, eq(products.id, adCampaigns.productId))
    .where(eq(adBids.id, bidId)).limit(1))[0];
  if (!ad || ad.status !== "LIVE") return NextResponse.redirect(home);
  try {
    await enforceRateLimit(db, request, "adClick", { rule: { limit: 60, windowSeconds: 60 * 60 } });
    if (ad.bidStatus === "WON" && ad.day === istDayKey()) {
      await db.update(adBids).set({ clicks: sql`${adBids.clicks} + 1` }).where(and(eq(adBids.id, bidId), eq(adBids.status, "WON")));
    }
  } catch { /* over the limit: still take the shopper to the product, just don't count it */ }
  return NextResponse.redirect(new URL(`/products/${ad.slug}`, request.url));
}
