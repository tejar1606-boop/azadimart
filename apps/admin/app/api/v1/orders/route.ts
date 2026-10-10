import { requireStaff } from "@azadimart/auth";
import { createDatabase, customers, orderItems, orders, payments, sellers, users } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPEN = ["CREATED", "PAYMENT_PENDING", "PAID", "CONFIRMED", "PACKED"] as const;
const STATUSES = ["CREATED", "PAYMENT_PENDING", "PAID", "CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED"] as const;
type Status = (typeof STATUSES)[number];
const PAGE_SIZE = 50;
const IST_OFFSET_MS = 330 * 60 * 1000;
/** Start of an India-time calendar day ("2026-10-11"). */
const istDayStart = (day: string) => new Date(Date.parse(day + "T00:00:00Z") - IST_OFFSET_MS);
const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * Orders for the admin Orders page: search (order number, customer name,
 * email, phone, seller, product, SKU, coupon), filters (status or "late",
 * date range in India time, Cash on Delivery / online, payment status),
 * counts per status, pages of 50, and CSV export (?format=csv).
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "orders");
    const db = createDatabase();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const status = url.searchParams.get("status") ?? "ALL";
    const pay = url.searchParams.get("payment") ?? "";
    const paymentStatus = url.searchParams.get("paymentStatus") ?? "";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const csv = url.searchParams.get("format") === "csv";
    const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page")) || 1));

    // Filters shared by the list and the status counts (everything except status).
    const base: SQL[] = [];
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
      const digits = q.replace(/\D/g, "");
      base.push(or(
        ilike(orders.orderNumber, like), ilike(customers.fullName, like), ilike(users.email, like), ilike(orders.couponCode, like),
        digits.length >= 4 ? or(ilike(users.phone, `%${digits}%`), sql`regexp_replace(coalesce(${orders.shippingAddressSnapshot}->>'phone', ''), '\D', '', 'g') like ${"%" + digits + "%"}`)! : sql`false`,
        sql`${orders.shippingAddressSnapshot}->>'name' ilike ${like}`,
        sql`exists (select 1 from ${orderItems} oi left join ${sellers} s on s.id = oi.seller_id where oi.order_id = ${orders.id} and (oi.title ilike ${like} or oi.sku ilike ${like} or s.store_name ilike ${like}))`,
      )!);
    }
    if (isDay(from)) base.push(gte(orders.createdAt, istDayStart(from)));
    if (isDay(to)) base.push(lt(orders.createdAt, new Date(istDayStart(to).getTime() + 864e5)));
    if (pay === "COD") base.push(sql`exists (select 1 from ${payments} p where p.order_id = ${orders.id} and p.provider = 'COD')`);
    if (pay === "ONLINE") base.push(sql`exists (select 1 from ${payments} p where p.order_id = ${orders.id} and p.provider <> 'COD')`);
    if (paymentStatus) base.push(sql`(select p.status from ${payments} p where p.order_id = ${orders.id} order by p.created_at desc limit 1) = ${paymentStatus}`);

    const statusWhere: SQL | undefined = status === "LATE"
      ? and(inArray(orders.status, [...OPEN]), isNotNull(orders.shipByAt), lt(orders.shipByAt, new Date()))
      : (STATUSES as readonly string[]).includes(status) ? eq(orders.status, status as Status) : undefined;
    const where = and(...base, statusWhere);

    const [statusCounts, lateCount, totalRow, requests] = await Promise.all([
      db.select({ status: orders.status, n: count() }).from(orders).leftJoin(customers, eq(customers.id, orders.customerId)).leftJoin(users, eq(users.id, customers.userId))
        .where(base.length ? and(...base) : undefined).groupBy(orders.status),
      db.select({ n: count() }).from(orders).leftJoin(customers, eq(customers.id, orders.customerId)).leftJoin(users, eq(users.id, customers.userId))
        .where(and(...base, inArray(orders.status, [...OPEN]), isNotNull(orders.shipByAt), lt(orders.shipByAt, new Date()))),
      db.select({ n: count() }).from(orders).leftJoin(customers, eq(customers.id, orders.customerId)).leftJoin(users, eq(users.id, customers.userId)).where(where),
      // Seller cancellation requests always show, whatever the filters.
      csv ? Promise.resolve([]) : db.select({ id: orders.id }).from(orders).where(and(isNotNull(orders.cancelRequestedAt), inArray(orders.status, [...OPEN]))),
    ]);
    const total = Number(totalRow[0]?.n ?? 0);

    const pageRows = await db.select({
      id: orders.id, orderNumber: orders.orderNumber, customerId: orders.customerId, status: orders.status,
      subtotalPaise: orders.subtotalPaise, discountPaise: orders.discountPaise, shippingPaise: orders.shippingPaise, grandTotalPaise: orders.grandTotalPaise,
      couponCode: orders.couponCode, createdAt: orders.createdAt, shipByAt: orders.shipByAt, deliveredAt: orders.deliveredAt,
      cancelledBy: orders.cancelledBy, cancellationReason: orders.cancellationReason, cancelRequestedAt: orders.cancelRequestedAt, cancelRequestReason: orders.cancelRequestReason,
      address: orders.shippingAddressSnapshot,
      customerName: customers.fullName, customerEmail: users.email, customerPhone: users.phone,
    }).from(orders).leftJoin(customers, eq(customers.id, orders.customerId)).leftJoin(users, eq(users.id, customers.userId))
      .where(where).orderBy(desc(orders.createdAt))
      .limit(csv ? 5000 : PAGE_SIZE).offset(csv ? 0 : (page - 1) * PAGE_SIZE);

    // The requests banner needs its orders too, even if they're not on this page.
    const requestIds = requests.map((r) => r.id).filter((id) => !pageRows.some((o) => o.id === id));
    const requestRows = requestIds.length ? await db.select({
      id: orders.id, orderNumber: orders.orderNumber, cancelRequestReason: orders.cancelRequestReason,
    }).from(orders).where(inArray(orders.id, requestIds)) : [];

    const ids = [...pageRows.map((o) => o.id), ...requestIds];
    const [lines, paymentRows] = ids.length ? await Promise.all([
      db.select({ orderId: orderItems.orderId, title: orderItems.title, quantity: orderItems.quantity, sellerName: sellers.storeName })
        .from(orderItems).leftJoin(sellers, eq(sellers.id, orderItems.sellerId)).where(inArray(orderItems.orderId, ids)),
      // An order can have several payment attempts: the latest one counts.
      db.select({ orderId: payments.orderId, status: payments.status, provider: payments.provider }).from(payments).where(inArray(payments.orderId, ids)).orderBy(desc(payments.createdAt)),
    ]) : [[], []];
    const latest = new Map<string, { status: string; provider: string }>();
    for (const p of paymentRows) if (!latest.has(p.orderId)) latest.set(p.orderId, p);
    const detail = (id: string) => {
      const mine = lines.filter((l) => l.orderId === id);
      const sellerNames = [...new Set(mine.map((l) => l.sellerName).filter((s): s is string => Boolean(s)))];
      return {
        itemCount: mine.reduce((s, l) => s + l.quantity, 0),
        firstItem: mine[0]?.title ?? null,
        sellers: sellerNames, sellerCount: sellerNames.length,
        paymentStatus: latest.get(id)?.status ?? null, paymentMethod: latest.get(id)?.provider ?? null,
      };
    };
    const items = pageRows.map(({ address, ...o }) => ({ ...o, deliverTo: address?.name ?? null, deliveryPhone: address?.phone ?? null, city: address?.city ?? null, state: address?.state ?? null, postalCode: address?.postalCode ?? null, ...detail(o.id) }));

    if (csv) {
      const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const header = ["Order", "Placed (IST)", "Status", "Customer", "Email", "Phone", "City", "State", "PIN", "Items", "Sellers", "Payment", "Payment status", "Subtotal", "Discount", "Shipping", "Total", "Coupon", "Ship by", "Delivered"];
      const ist = (d: Date | null) => (d ? new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ") : "");
      const rows = items.map((o) => [o.orderNumber, ist(o.createdAt), o.status, o.customerName, o.customerEmail, o.deliveryPhone ?? o.customerPhone, o.city, o.state, o.postalCode, o.itemCount, o.sellers.join(" | "), o.paymentMethod === "COD" ? "Cash on Delivery" : o.paymentMethod ? "Online" : "", o.paymentStatus, o.subtotalPaise / 100, o.discountPaise / 100, o.shippingPaise / 100, o.grandTotalPaise / 100, o.couponCode, ist(o.shipByAt), ist(o.deliveredAt)]);
      const body = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
      return new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="azadimart-orders-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
    }

    const counts: Record<string, number> = Object.fromEntries(statusCounts.map((c) => [c.status, Number(c.n)]));
    return NextResponse.json({
      items,
      total, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      counts: { ALL: Object.values(counts).reduce((s, n) => s + n, 0), LATE: Number(lateCount[0]?.n ?? 0), ...counts },
      requests: [
        ...items.filter((o) => o.cancelRequestedAt && (OPEN as readonly string[]).includes(o.status)).map((o) => ({ id: o.id, orderNumber: o.orderNumber, cancelRequestReason: o.cancelRequestReason, sellers: o.sellers })),
        ...requestRows.map((o) => ({ ...o, sellers: detail(o.id).sellers })),
      ],
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
