import { requireStaff } from "@azadimart/auth";
import { createDatabase, customerWalletEntries, customers, orders, users } from "@azadimart/database";
import { istDayStartAgo, toApiError } from "@azadimart/shared";
import { and, count, desc, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const PLACED = sql`${orders.status} not in ('CREATED', 'PAYMENT_PENDING')`;
const KEPT = sql`${orders.status} not in ('CREATED', 'PAYMENT_PENDING', 'CANCELLED', 'RETURNED')`;

/** Shoppers for the admin Customers page: search (name, email, mobile), status filter, totals, pages of 50. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "orders");
    const db = createDatabase();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const status = url.searchParams.get("status") ?? "ALL";
    const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page")) || 1));

    const where: SQL[] = [];
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
      const digits = q.replace(/\D/g, "");
      where.push(or(ilike(customers.fullName, like), ilike(users.email, like), digits.length >= 4 ? ilike(users.phone, `%${digits}%`) : sql`false`)!);
    }
    if (status === "ACTIVE" || status === "DISABLED") where.push(eq(users.status, status));
    if (status === "BUYERS") where.push(sql`exists (select 1 from ${orders} where ${orders.customerId} = ${customers.id} and ${PLACED})`);
    const filter = where.length ? and(...where) : undefined;

    const startOfDay = istDayStartAgo(new Date(), 0);
    const [rows, [totalRow], [stats]] = await Promise.all([
      db.select({
        id: customers.id, name: customers.fullName, email: users.email, phone: users.phone, phoneVerified: isNotNull(users.phoneVerifiedAt),
        status: users.status, joinedAt: customers.createdAt, lastLoginAt: users.lastLoginAt,
        orders: sql<number>`(select count(*)::int from ${orders} where ${orders.customerId} = ${customers.id} and ${PLACED})`,
        spentPaise: sql<number>`(select coalesce(sum(${orders.grandTotalPaise}), 0)::int from ${orders} where ${orders.customerId} = ${customers.id} and ${KEPT})`,
        lastOrderAt: sql<string | null>`(select max(${orders.createdAt}) from ${orders} where ${orders.customerId} = ${customers.id} and ${PLACED})`,
        walletPaise: sql<number>`(select coalesce(sum(${customerWalletEntries.remainingPaise}), 0)::int from ${customerWalletEntries} where ${customerWalletEntries.customerId} = ${customers.id} and ${customerWalletEntries.remainingPaise} > 0 and (${customerWalletEntries.expiresAt} is null or ${customerWalletEntries.expiresAt} > now()))`,
      }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(filter)
        .orderBy(desc(customers.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
      db.select({ total: count() }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(filter),
      db.select({
        all: count(),
        today: sql<number>`count(*) filter (where ${customers.createdAt} >= ${startOfDay})::int`,
        verified: sql<number>`count(*) filter (where ${users.phoneVerifiedAt} is not null)::int`,
        disabled: sql<number>`count(*) filter (where ${users.status} = 'DISABLED')::int`,
        buyers: sql<number>`count(*) filter (where exists (select 1 from ${orders} where ${orders.customerId} = ${customers.id} and ${PLACED}))::int`,
      }).from(customers).innerJoin(users, eq(users.id, customers.userId)),
    ]);
    return NextResponse.json({
      items: rows.map((r) => ({ ...r, orders: Number(r.orders), spentPaise: Number(r.spentPaise), walletPaise: Number(r.walletPaise) })),
      total: Number(totalRow?.total ?? 0), page, pages: Math.max(1, Math.ceil(Number(totalRow?.total ?? 0) / PAGE_SIZE)),
      stats: { all: Number(stats?.all ?? 0), today: Number(stats?.today ?? 0), verified: Number(stats?.verified ?? 0), disabled: Number(stats?.disabled ?? 0), buyers: Number(stats?.buyers ?? 0) },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
