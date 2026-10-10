import { requireApiAccess } from "@azadimart/auth";
import { adCampaigns, auditLogs, createDatabase } from "@azadimart/database";
import { notifySeller } from "@azadimart/notify";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Approve or reject a seller's ad (banner, headline, product). Only approved ads run. */
export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { campaignId } = await params;
    if (!uuidSchema.safeParse(campaignId).success) throw new AppError("NOT_FOUND", "Ad not found");
    const { decision, note } = (await request.json().catch(() => ({}))) as { decision?: string; note?: string };
    if (decision !== "APPROVED" && decision !== "REJECTED") throw new AppError("VALIDATION_ERROR", "Choose approve or reject");
    const text = typeof note === "string" ? note.trim().slice(0, 300) : "";
    if (decision === "REJECTED" && text.length < 3) throw new AppError("VALIDATION_ERROR", "Tell the seller what to change");
    const db = createDatabase();
    const [ad] = await db.update(adCampaigns).set({ status: decision, reviewNote: text || null, reviewedByUserId: principal.userId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(adCampaigns.id, campaignId)).returning({ sellerId: adCampaigns.sellerId, headline: adCampaigns.headline });
    if (!ad) throw new AppError("NOT_FOUND", "Ad not found");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "AD_" + decision, entityType: "ad_campaign", entityId: campaignId, metadata: { note: text || null } });
    await notifySeller(db, { sellerId: ad.sellerId, kind: "AD_REVIEWED", dedupeKey: `AD_REVIEW:${campaignId}:${Date.now()}`, href: "/ads",
      title: decision === "APPROVED" ? `Your ad "${ad.headline}" is approved` : `Your ad "${ad.headline}" needs changes`,
      body: decision === "APPROVED" ? "It will show on the days you've booked." : `${text}. Update it before your booked days start; ads that aren't approved don't run and aren't charged.` });
    return NextResponse.json({ ok: true, status: decision });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
