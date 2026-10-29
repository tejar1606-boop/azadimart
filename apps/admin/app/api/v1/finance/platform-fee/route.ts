import { requireStaff } from "@azadimart/auth";
import { createDatabase, orders, platformFeeSettings, setPlatformSetting } from "@azadimart/database";
import { PLATFORM_FEE_KEY, platformFeeSettingsSchema, toApiError } from "@azadimart/shared";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Platform fee shoppers pay per order, and what it has brought in (orders not cancelled or returned). */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "payments");
    const db = createDatabase();
    const [settings, totals] = await Promise.all([
      platformFeeSettings(db),
      db.select({
        orders: sql<number>`count(*) filter (where ${orders.platformFeePaise} > 0)::int`,
        collectedPaise: sql<number>`coalesce(sum(${orders.platformFeePaise}) filter (where ${orders.status} = 'DELIVERED'), 0)::int`,
        pendingPaise: sql<number>`coalesce(sum(${orders.platformFeePaise}) filter (where ${orders.status} not in ('DELIVERED', 'CANCELLED', 'RETURNED')), 0)::int`,
      }).from(orders).where(sql`${orders.status} not in ('CANCELLED', 'RETURNED')`).then((r) => r[0]!),
    ]);
    return NextResponse.json({ settings, totals });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "payments");
    const settings = platformFeeSettingsSchema.parse(await request.json());
    await setPlatformSetting(createDatabase(), PLATFORM_FEE_KEY, settings, principal.userId);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
