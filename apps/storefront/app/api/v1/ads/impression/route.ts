import { enforceRateLimit } from "@azadimart/auth";
import { adBids, createDatabase } from "@azadimart/database";
import { istDayKey, uuidSchema } from "@azadimart/shared";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** A sponsored banner was shown (counted once per browser session by the carousel). */
export async function POST(request: Request) {
  try {
    const { bidId } = (await request.json().catch(() => ({}))) as { bidId?: string };
    if (!bidId || !uuidSchema.safeParse(bidId).success) return new NextResponse(null, { status: 204 });
    const db = createDatabase();
    await enforceRateLimit(db, request, "adView", { rule: { limit: 300, windowSeconds: 60 * 60 } });
    await db.update(adBids).set({ impressions: sql`${adBids.impressions} + 1` }).where(and(eq(adBids.id, bidId), eq(adBids.status, "WON"), eq(adBids.day, istDayKey())));
  } catch { /* counting must never fail the page */ }
  return new NextResponse(null, { status: 204 });
}
