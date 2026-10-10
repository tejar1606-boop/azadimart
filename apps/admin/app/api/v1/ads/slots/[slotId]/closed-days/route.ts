import { requireApiAccess } from "@azadimart/auth";
import { adBids, adSlotClosedDays, auditLogs, createDatabase } from "@azadimart/database";
import { AppError, adSlotClosedDaysSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Take days off sale (e.g. for AzadiMart's own sale banner) or put them back. Booked days can't be closed. */
export async function POST(request: Request, { params }: { params: Promise<{ slotId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { slotId } = await params;
    if (!uuidSchema.safeParse(slotId).success) throw new AppError("NOT_FOUND", "Ad space not found");
    const { days, closed } = adSlotClosedDaysSchema.parse(await request.json());
    const db = createDatabase();
    if (closed) {
      const taken = await db.select({ day: adBids.day }).from(adBids).where(and(eq(adBids.slotId, slotId), inArray(adBids.day, days), inArray(adBids.status, ["WON", "ACTIVE"])));
      if (taken.length) throw new AppError("CONFLICT", `Sellers already bid on or booked ${[...new Set(taken.map((t) => t.day))].join(", ")}. Withdraw those first.`);
      await db.insert(adSlotClosedDays).values(days.map((day) => ({ slotId, day }))).onConflictDoNothing();
    } else {
      await db.delete(adSlotClosedDays).where(and(eq(adSlotClosedDays.slotId, slotId), inArray(adSlotClosedDays.day, days)));
    }
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: closed ? "AD_DAYS_CLOSED" : "AD_DAYS_OPENED", entityType: "ad_slot", entityId: slotId, metadata: { days } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
