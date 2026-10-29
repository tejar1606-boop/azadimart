import { changeReturnStatus, createDatabase, orders, returns, users } from "@azadimart/database";
import { notifySeller } from "@azadimart/notify";
import { RETURN_DEADLINES, returnDeadline, toApiError } from "@azadimart/shared";
import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cronCaller } from "../../../lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOUR = 60 * 60 * 1000;
const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Return deadlines for sellers. A new request the seller hasn't answered in
 * 48 hours is approved by LOIMART automatically (the customer isn't kept
 * waiting); sellers are reminded before that, and told when they're late to
 * book the pickup or mark the item received (LOIMART can then step in from
 * Admin → Returns → Late). Runs daily (reminders cover the last 24 hours);
 * alerts are de-duplicated, so running it more often is safe.
 */
async function run(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (!(await cronCaller(request))) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not allowed" } }, { status: 401 });
    const db = createDatabase();
    const now = new Date();
    const open = await db.select({ id: returns.id, sellerId: returns.sellerId, status: returns.status, since: returns.updatedAt, orderNumber: orders.orderNumber })
      .from(returns).innerJoin(orders, eq(orders.id, returns.orderId)).where(inArray(returns.status, ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED"]));
    // Any admin user stands in as the actor for automatic approvals in the audit trail.
    const system = (await db.select({ id: users.id }).from(users).where(inArray(users.role, ["SUPER_ADMIN", "ADMIN"])).limit(1))[0];
    const result = { checked: open.length, reminded: 0, late: 0, autoApproved: 0, skipped: 0 };

    for (const ret of open) {
      const deadline = returnDeadline(ret.status, ret.since, now);
      if (!deadline) continue;
      const tag = `${ret.id}:${ret.status}`;
      if (ret.status === "REQUESTED" && deadline.overdue) {
        if (!system) { result.skipped++; continue; }
        try {
          await db.transaction((tx) => changeReturnStatus(tx, { returnId: ret.id, next: "APPROVED", actorUserId: system.id, notes: `Seller didn't reply within ${RETURN_DEADLINES.replyHours} hours: approved by LOIMART`, by: "SYSTEM" }));
          await notifySeller(db, { sellerId: ret.sellerId, kind: "RETURN_AUTO_APPROVED", dedupeKey: `RETURN_AUTO:${ret.id}`, href: "/returns", title: `Return for order ${ret.orderNumber} was approved by LOIMART`, body: `You didn't reply within ${RETURN_DEADLINES.replyHours} hours. Book the pickup within ${RETURN_DEADLINES.bookPickupDays} days.` });
          result.autoApproved++;
        } catch { result.skipped++; } // changed meanwhile (e.g. the seller just replied)
        continue;
      }
      if (deadline.overdue) {
        if (await notifySeller(db, { sellerId: ret.sellerId, kind: "RETURN_LATE", dedupeKey: `RETURN_LATE:${tag}`, href: "/returns", title: `Return for order ${ret.orderNumber} is late`, body: `${deadline.task} — it was due ${when(deadline.dueAt)}. LOIMART may step in.` })) result.late++;
      } else if (deadline.dueAt.getTime() - now.getTime() <= 24 * HOUR) {
        if (await notifySeller(db, { sellerId: ret.sellerId, kind: "RETURN_REMINDER", dedupeKey: `RETURN_REMIND:${tag}`, href: "/returns", title: `Return for order ${ret.orderNumber}: action needed`, body: `${deadline.task} by ${when(deadline.dueAt)}.${ret.status === "REQUESTED" ? " Otherwise LOIMART approves it automatically." : ""}` })) result.reminded++;
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
