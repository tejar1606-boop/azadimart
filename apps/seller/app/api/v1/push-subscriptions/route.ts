import { createDatabase, pushSubscriptions } from "@azadimart/database";
import { pushSubscriptionSchema, toApiError } from "@azadimart/shared";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSeller } from "../notifications/seller";

/** Save this device's browser-push subscription (from the Alerts settings page). */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { sellerId, userId } = await requireSeller(request);
    const input = pushSubscriptionSchema.parse(await request.json());
    await createDatabase().insert(pushSubscriptions).values({ sellerId, userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { sellerId, userId, p256dh: sql`excluded.p256dh`, auth: sql`excluded.auth`, updatedAt: new Date() } });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Turn push off for this device. */
export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { sellerId } = await requireSeller(request);
    const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
    if (endpoint) await createDatabase().delete(pushSubscriptions).where(and(eq(pushSubscriptions.sellerId, sellerId), eq(pushSubscriptions.endpoint, endpoint)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
