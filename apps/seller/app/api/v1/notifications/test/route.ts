import { enforceRateLimit } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { notifySeller } from "@azadimart/notify";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { requireSeller } from "../seller";

/** Sends a test alert so the seller can check pop-ups and phone/desktop notifications work. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { sellerId, userId } = await requireSeller(request);
    const db = createDatabase();
    await enforceRateLimit(db, request, "alertTest", { subject: userId, rule: { limit: 10, windowSeconds: 60 * 60 } });
    await notifySeller(db, { sellerId, kind: "NEW_ORDER", title: "Test alert from AzadiMart", body: "This is how new-order alerts will look.", href: "/orders", dedupeKey: `TEST:${Date.now()}` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
