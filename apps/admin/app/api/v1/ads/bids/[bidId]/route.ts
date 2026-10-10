import { requireApiAccess } from "@azadimart/auth";
import { adBids, auditLogs, createDatabase } from "@azadimart/database";
import { notifySeller } from "@azadimart/notify";
import { AppError, istDayKey, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, gte, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Withdraw a booking or top bid (e.g. a policy problem). The day opens again; nothing is charged. */
export async function DELETE(request: Request, { params }: { params: Promise<{ bidId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { bidId } = await params;
    if (!uuidSchema.safeParse(bidId).success) throw new AppError("NOT_FOUND", "Booking not found");
    const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };
    const text = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
    if (text.length < 3) throw new AppError("VALIDATION_ERROR", "Give the seller a reason");
    const db = createDatabase();
    const [bid] = await db.update(adBids).set({ status: "CANCELLED", updatedAt: new Date() })
      .where(and(eq(adBids.id, bidId), inArray(adBids.status, ["WON", "ACTIVE"]), gte(adBids.day, istDayKey()))).returning();
    if (!bid) throw new AppError("CONFLICT", "Only upcoming bookings and bids can be withdrawn");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "AD_BOOKING_WITHDRAWN", entityType: "ad_bid", entityId: bidId, metadata: { reason: text, day: bid.day, amountPaise: bid.amountPaise } });
    await notifySeller(db, { sellerId: bid.sellerId, kind: "AD_LOST", dedupeKey: `AD_WITHDRAWN:${bidId}`, href: "/ads", title: `Your ad booking for ${bid.day} was withdrawn`, body: `${text}. You won't be charged for it.` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
