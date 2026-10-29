import { adCalendar } from "@azadimart/database";
import { settleAdAuctions } from "@azadimart/notify";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { requireAdSeller } from "../../seller";

export const dynamic = "force-dynamic";

/** Booking calendar for one ad space: open, bidding (top bid), booked, closed. Other sellers stay anonymous. */
export async function GET(request: Request, { params }: { params: Promise<{ slotId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { db, sellerId } = await requireAdSeller(request);
    const { slotId } = await params;
    if (!uuidSchema.safeParse(slotId).success) throw new AppError("NOT_FOUND", "Ad space not found");
    await settleAdAuctions(db);
    const calendar = await adCalendar(db, slotId, { sellerId });
    if (!calendar || !calendar.slot.isActive) throw new AppError("NOT_FOUND", "Ad space not found");
    return NextResponse.json({ days: calendar.days });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
