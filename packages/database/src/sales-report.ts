import { canonicalState, INDIAN_STATES, istDayStartAgo, istDays } from "@azadimart/shared";
import { and, count, gte, notInArray, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import { orders } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Counts = { orders: number; salesPaise: number; cancelled: number; returned: number };
export type SalesDay = { day: string; orders: number; salesPaise: number; cancelled: number; returned: number };
export type SalesState = Counts & { state: string; topCities: string[] };
export type SalesReport = {
  from: string; days: SalesDay[]; states: SalesState[]; noOrders: string[];
  totals: Counts;
};

const UNKNOWN = "Not a known state";

/**
 * Orders placed per India-time day and per delivery state over the last `days` days.
 * "Orders" are all placed orders (payment done or Cash on Delivery confirmed);
 * sales count only orders that weren't cancelled or returned.
 */
export async function salesReport(db: Db, days: number, now = new Date()): Promise<SalesReport> {
  const from = istDayStartAgo(now, days - 1);
  const rows = await db.select({
    day: sql<string>`to_char(${orders.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`,
    state: sql<string>`coalesce(${orders.shippingAddressSnapshot}->>'state', '')`,
    city: sql<string>`initcap(trim(coalesce(${orders.shippingAddressSnapshot}->>'city', '')))`,
    status: orders.status,
    n: count(),
    total: sql<string>`coalesce(sum(${orders.grandTotalPaise}), 0)`,
  }).from(orders)
    .where(and(gte(orders.createdAt, from), notInArray(orders.status, ["CREATED", "PAYMENT_PENDING"])))
    .groupBy(sql`1`, sql`2`, sql`3`, orders.status);

  const empty = (): Counts => ({ orders: 0, salesPaise: 0, cancelled: 0, returned: 0 });
  const byDay = new Map(istDays(now, days).map((d) => [d, { day: d, ...empty() }]));
  const byState = new Map<string, Counts & { cities: Map<string, number> }>();
  const add = (t: Counts, status: string, n: number, paise: number) => {
    t.orders += n;
    if (status === "CANCELLED") t.cancelled += n;
    else if (status === "RETURNED") t.returned += n;
    else t.salesPaise += paise;
  };
  const totals = empty();
  for (const r of rows) {
    const n = Number(r.n), paise = Number(r.total);
    const day = byDay.get(r.day);
    if (day) add(day, r.status, n, paise);
    const name = canonicalState(r.state) ?? UNKNOWN;
    const s = byState.get(name) ?? { ...empty(), cities: new Map<string, number>() };
    add(s, r.status, n, paise);
    if (r.city) s.cities.set(r.city, (s.cities.get(r.city) ?? 0) + n);
    byState.set(name, s);
    add(totals, r.status, n, paise);
  }
  const states = [...byState.entries()].map(([state, { cities, ...s }]) => ({
    ...s, state,
    topCities: [...cities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c),
  })).sort((a, b) => b.orders - a.orders || b.salesPaise - a.salesPaise || a.state.localeCompare(b.state));
  return {
    from: from.toISOString(), days: [...byDay.values()], states, totals,
    noOrders: INDIAN_STATES.filter((s) => !byState.has(s)),
  };
}
