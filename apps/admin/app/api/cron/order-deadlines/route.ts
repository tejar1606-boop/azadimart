import { getSessionPrincipal } from "@azadimart/auth";
import { auditLogs, cancelOrderInTransaction, createDatabase, orderItems, orders, shipments, users } from "@azadimart/database";
import { notifySeller, notifySellersOfCancellation } from "@azadimart/notify";
import { AUTO_CANCEL_DAYS, toApiError } from "@azadimart/shared";
import { and, inArray, notInArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOUR = 60 * 60 * 1000;
const day = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; admins can also run it from the Orders page. */
async function authorised(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (secret && header.startsWith("Bearer ")) {
    const given = Buffer.from(header.slice(7)), expected = Buffer.from(secret);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  const principal = await getSessionPrincipal(request, createDatabase()).catch(() => null);
  return Boolean(principal && (principal.role === "ADMIN" || principal.role === "SUPER_ADMIN"));
}

/**
 * Order deadlines, Amazon/Flipkart style. For every confirmed or packed
 * order a seller hasn't shipped yet: remind the seller when the ship-by time
 * is within 12 hours, flag it as late once it's passed, and auto-cancel the
 * order (releasing stock, telling the sellers) once it's AUTO_CANCEL_DAYS
 * old. Alerts are de-duplicated, so running this often is safe.
 */
async function run(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (!(await authorised(request))) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not allowed" } }, { status: 401 });
    const db = createDatabase();
    const now = new Date();
    const open = await db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, createdAt: orders.createdAt, shipByAt: orders.shipByAt })
      .from(orders).where(inArray(orders.status, ["CONFIRMED", "PACKED"]));
    const ids = open.map((o) => o.id);
    const [lines, active] = ids.length ? await Promise.all([
      db.select({ orderId: orderItems.orderId, sellerId: orderItems.sellerId, title: orderItems.title, quantity: orderItems.quantity }).from(orderItems).where(inArray(orderItems.orderId, ids)),
      db.select({ orderId: shipments.orderId, sellerId: shipments.sellerId }).from(shipments).where(and(inArray(shipments.orderId, ids), notInArray(shipments.status, ["FAILED", "CANCELLED"]))),
    ]) : [[], []];
    const shipped = new Set(active.map((s) => `${s.orderId}:${s.sellerId}`));
    // Any admin user stands in as the actor for automatic cancellations in the audit trail.
    const system = (await db.select({ id: users.id }).from(users).where(inArray(users.role, ["SUPER_ADMIN", "ADMIN"])).limit(1))[0];
    const result = { checked: open.length, reminded: 0, late: 0, autoCancelled: 0, skipped: 0 };

    for (const order of open) {
      const ageMs = now.getTime() - order.createdAt.getTime();
      const sellers = [...new Set(lines.filter((l) => l.orderId === order.id).map((l) => l.sellerId))].filter((s) => !shipped.has(`${order.id}:${s}`));
      if (!sellers.length) continue;

      if (ageMs > AUTO_CANCEL_DAYS * 24 * HOUR && system) {
        try {
          await db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${order.id}, 0))`);
            await cancelOrderInTransaction(tx, { orderId: order.id, fromStatus: order.status, actorUserId: system.id, reason: `Not shipped within ${AUTO_CANCEL_DAYS} days`, referenceType: "AUTO_CANCELLATION", by: "SYSTEM" });
            await tx.insert(auditLogs).values({ actorUserId: system.id, action: "ORDER_AUTO_CANCELLED", entityType: "order", entityId: order.id, metadata: { orderNumber: order.orderNumber, ageDays: Math.floor(ageMs / (24 * HOUR)) } });
          });
          await notifySellersOfCancellation(db, order.id, "SYSTEM", `Not shipped within ${AUTO_CANCEL_DAYS} days`);
          result.autoCancelled++;
        } catch {
          // e.g. part already shipped by another seller, or a prepaid order needing a refund first: left for an admin.
          result.skipped++;
        }
        continue;
      }
      if (!order.shipByAt) continue;
      const left = order.shipByAt.getTime() - now.getTime();
      for (const sellerId of sellers) {
        const mine = lines.filter((l) => l.orderId === order.id && l.sellerId === sellerId);
        const what = `${mine[0]!.title} × ${mine[0]!.quantity}${mine.length > 1 ? ` and ${mine.length - 1} more` : ""}`;
        if (left <= 0) {
          if (await notifySeller(db, { sellerId, kind: "ORDER_LATE", dedupeKey: `LATE:${order.id}`, href: "/orders", title: `Order ${order.orderNumber} is late`, body: `It should have shipped by ${day(order.shipByAt)}. Ship ${what} now; it's cancelled automatically ${AUTO_CANCEL_DAYS} days after ordering.` })) result.late++;
        } else if (left <= 12 * HOUR) {
          if (await notifySeller(db, { sellerId, kind: "SHIP_BY_REMINDER", dedupeKey: `REMIND:${order.id}`, href: "/orders", title: `Ship order ${order.orderNumber} today`, body: `${what} must ship by ${day(order.shipByAt)}.` })) result.reminded++;
        }
      }
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export const GET = run;
export const POST = run;
