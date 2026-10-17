import { customers, sellers, supportTickets, users } from "@azadimart/database";
import { SUPPORT_FIRST_REPLY_HOURS, isSupportOverdue, toApiError, type SupportPriority } from "@azadimart/shared";
import { and, avg, count, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSupportStaff, supportTeam } from "../staff";

export const dynamic = "force-dynamic";

const VIEWS = ["open", "mine", "unassigned", "overdue", "waiting", "resolved", "all"] as const;

/**
 * The support queue with filters, plus headline numbers for the dashboard.
 * Views: open (needs the team), mine, unassigned, overdue, waiting (on the
 * requester), resolved, all.
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, userId } = await requireSupportStaff(request);
    const url = new URL(request.url);
    const view = (VIEWS as readonly string[]).includes(url.searchParams.get("view") ?? "") ? url.searchParams.get("view")! : "open";
    const type = url.searchParams.get("type");
    const category = url.searchParams.get("category");
    const priority = url.searchParams.get("priority");
    const q = (url.searchParams.get("q") ?? "").trim().replace(/^#/, "");

    const active = inArray(supportTickets.status, ["OPEN", "IN_PROGRESS"]);
    const where: SQL[] = [];
    if (view === "open" || view === "overdue") where.push(active);
    if (view === "mine") where.push(eq(supportTickets.assignedToUserId, userId), inArray(supportTickets.status, ["OPEN", "IN_PROGRESS", "WAITING"]));
    if (view === "unassigned") where.push(isNull(supportTickets.assignedToUserId), inArray(supportTickets.status, ["OPEN", "IN_PROGRESS", "WAITING"]));
    if (view === "waiting") where.push(eq(supportTickets.status, "WAITING"));
    if (view === "resolved") where.push(inArray(supportTickets.status, ["RESOLVED", "CLOSED"]));
    if (type === "CUSTOMER" || type === "SELLER") where.push(eq(supportTickets.requesterType, type));
    if (category) where.push(eq(supportTickets.category, category));
    if (priority) where.push(eq(supportTickets.priority, priority as SupportPriority));
    if (q) {
      const like = `%${q}%`;
      where.push(or(ilike(supportTickets.subject, like), ilike(supportTickets.body, like), ilike(users.email, like), ilike(customers.fullName, like), ilike(sellers.storeName, like), /^\d+$/.test(q) ? eq(supportTickets.number, Number(q)) : sql`false`)!);
    }

    const rows = await db.select({
      id: supportTickets.id, number: supportTickets.number, requesterType: supportTickets.requesterType, category: supportTickets.category,
      priority: supportTickets.priority, status: supportTickets.status, subject: supportTickets.subject, body: supportTickets.body,
      channel: supportTickets.channel, assignedToUserId: supportTickets.assignedToUserId, lastMessageAt: supportTickets.lastMessageAt,
      lastReplyBy: supportTickets.lastReplyBy, staffUnread: supportTickets.staffUnread, createdAt: supportTickets.createdAt, rating: supportTickets.rating,
      email: users.email, customerName: customers.fullName, storeName: sellers.storeName, orderId: supportTickets.orderId,
    }).from(supportTickets)
      .leftJoin(users, eq(users.id, supportTickets.requesterUserId))
      .leftJoin(customers, eq(customers.id, supportTickets.customerId))
      .leftJoin(sellers, eq(sellers.id, supportTickets.sellerId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(view === "resolved" || view === "all" ? desc(supportTickets.lastMessageAt) : sql`case ${supportTickets.priority} when 'URGENT' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end, ${supportTickets.lastMessageAt} asc`)
      .limit(300);

    const now = Date.now();
    let items = rows.map((r) => ({ ...r, requesterName: r.storeName ?? r.customerName ?? r.email ?? "Unknown", overdue: isSupportOverdue(r, now) }));
    if (view === "overdue") items = items.filter((t) => t.overdue);

    // Headline numbers (whole desk, not the filtered list).
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const [openRows, waiting, resolvedToday, firstReply, rating, chats] = await Promise.all([
      db.select({ priority: supportTickets.priority, status: supportTickets.status, lastReplyBy: supportTickets.lastReplyBy, lastMessageAt: supportTickets.lastMessageAt, assignedToUserId: supportTickets.assignedToUserId, requesterType: supportTickets.requesterType }).from(supportTickets).where(active),
      db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.status, "WAITING")),
      db.select({ n: count() }).from(supportTickets).where(and(inArray(supportTickets.status, ["RESOLVED", "CLOSED"]), gte(supportTickets.resolvedAt, dayAgo))),
      db.select({ hours: avg(sql<number>`extract(epoch from (${supportTickets.firstResponseAt} - ${supportTickets.createdAt})) / 3600`) }).from(supportTickets).where(gte(supportTickets.createdAt, weekAgo)),
      db.select({ avg: avg(supportTickets.rating), n: count(supportTickets.rating) }).from(supportTickets).where(gte(supportTickets.createdAt, new Date(now - 30 * 864e5))),
      db.execute<{ total: number; escalated: number }>(sql`select count(*)::int total, count(ticket_id)::int escalated from support_chats where created_at > ${weekAgo.toISOString()}::timestamptz`),
    ]);
    const chatRow = chats.rows[0] ?? { total: 0, escalated: 0 };
    return NextResponse.json({
      items,
      stats: {
        open: openRows.length,
        openCustomers: openRows.filter((t) => t.requesterType === "CUSTOMER").length,
        openSellers: openRows.filter((t) => t.requesterType === "SELLER").length,
        unassigned: openRows.filter((t) => !t.assignedToUserId).length,
        overdue: openRows.filter((t) => isSupportOverdue(t, now)).length,
        mine: openRows.filter((t) => t.assignedToUserId === userId).length,
        waiting: Number(waiting[0]?.n ?? 0),
        resolvedToday: Number(resolvedToday[0]?.n ?? 0),
        firstReplyHours: firstReply[0]?.hours != null ? Math.round(Number(firstReply[0].hours) * 10) / 10 : null,
        rating: rating[0]?.avg != null ? Math.round(Number(rating[0].avg) * 10) / 10 : null,
        ratingCount: Number(rating[0]?.n ?? 0),
        botChats7d: Number(chatRow.total), botEscalated7d: Number(chatRow.escalated),
        targets: SUPPORT_FIRST_REPLY_HOURS,
      },
      team: await supportTeam(db),
      me: userId,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
