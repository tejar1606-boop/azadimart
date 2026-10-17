import { createDatabase, sellerNotifications } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSeller } from "../seller";

/** Mark all of the seller's alerts as read. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { sellerId } = await requireSeller(request);
    await createDatabase().update(sellerNotifications).set({ readAt: new Date() }).where(and(eq(sellerNotifications.sellerId, sellerId), isNull(sellerNotifications.readAt)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
