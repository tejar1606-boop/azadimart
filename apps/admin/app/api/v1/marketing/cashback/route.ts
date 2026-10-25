import { requireStaff } from "@azadimart/auth";
import { cashbackSettings, createDatabase, orderCashbacks, orders, setPlatformSetting } from "@azadimart/database";
import { ORDER_CASHBACK_KEY, cashbackSettingsSchema, toApiError } from "@azadimart/shared";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Order cashback rules and what it has given: added to wallets, not given (returned), still waiting for the return window. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "marketing");
    const db = createDatabase();
    const [settings, given, waiting] = await Promise.all([
      cashbackSettings(db),
      db.select({
        granted: sql<number>`count(*) filter (where ${orderCashbacks.status} = 'GRANTED')::int`,
        grantedPaise: sql<number>`coalesce(sum(${orderCashbacks.amountPaise}) filter (where ${orderCashbacks.status} = 'GRANTED'), 0)::int`,
        forfeited: sql<number>`count(*) filter (where ${orderCashbacks.status} = 'FORFEITED')::int`,
      }).from(orderCashbacks).then((r) => r[0]!),
      db.select({ orders: sql<number>`count(*)::int`, paise: sql<number>`coalesce(sum(${orders.cashbackPaise}), 0)::int` }).from(orders)
        .where(sql`${orders.cashbackPaise} > 0 and ${orders.status} not in ('CANCELLED', 'RETURNED') and not exists (select 1 from order_cashbacks oc where oc.order_id = ${orders.id})`).then((r) => r[0]!),
    ]);
    return NextResponse.json({ settings, totals: { ...given, waitingOrders: waiting.orders, waitingPaise: waiting.paise } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "marketing");
    const settings = cashbackSettingsSchema.parse(await request.json());
    await setPlatformSetting(createDatabase(), ORDER_CASHBACK_KEY, settings, principal.userId);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
