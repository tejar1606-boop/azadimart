import { createDatabase, pushSubscriptions, sellerSettings } from "@azadimart/database";
import { alertPreferences } from "@azadimart/notify";
import { sellerAlertSettingsSchema, toApiError } from "@azadimart/shared";
import { count, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSeller } from "../seller";

export const dynamic = "force-dynamic";

/** Which alerts the seller wants, and how many devices get push alerts. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { sellerId } = await requireSeller(request);
    const db = createDatabase();
    const [prefs, devices] = await Promise.all([alertPreferences(db, sellerId), db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.sellerId, sellerId))]);
    return NextResponse.json({ settings: prefs, devices: Number(devices[0]?.n ?? 0), pushAvailable: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { sellerId } = await requireSeller(request);
    const input = sellerAlertSettingsSchema.parse(await request.json());
    await createDatabase().insert(sellerSettings).values({ sellerId, notificationSettings: input })
      .onConflictDoUpdate({ target: sellerSettings.sellerId, set: { notificationSettings: sql`excluded.notification_settings`, updatedAt: new Date() } });
    return NextResponse.json({ ok: true, settings: input });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
