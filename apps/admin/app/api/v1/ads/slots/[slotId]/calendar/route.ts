import { requireApiAccess } from "@azadimart/auth";
import { adBids, adCalendar, createDatabase, sellers } from "@azadimart/database";
import { settleAdAuctions } from "@azadimart/notify";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The slot's calendar, with who holds each day (admins only). */
export async function GET(request: Request, { params }: { params: Promise<{ slotId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { slotId } = await params;
    if (!uuidSchema.safeParse(slotId).success) throw new AppError("NOT_FOUND", "Ad space not found");
    const db = createDatabase();
    await settleAdAuctions(db);
    const calendar = await adCalendar(db, slotId);
    if (!calendar) throw new AppError("NOT_FOUND", "Ad space not found");
    const holders = await db.select({ day: adBids.day, status: adBids.status, storeName: sellers.storeName })
      .from(adBids).innerJoin(sellers, eq(sellers.id, adBids.sellerId))
      .where(and(eq(adBids.slotId, slotId), inArray(adBids.status, ["ACTIVE", "WON"]), inArray(adBids.day, calendar.days.map((d) => d.day))));
    const byDay = new Map(holders.map((h) => [h.day, h.storeName]));
    return NextResponse.json({ slot: calendar.slot, days: calendar.days.map((d) => ({ ...d, holder: byDay.get(d.day) ?? null })) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
