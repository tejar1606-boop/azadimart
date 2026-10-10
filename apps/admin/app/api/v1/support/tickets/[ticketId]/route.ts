import {
  addStaffMessage, auditLogs, customers, orderItems, orders, payments, products, sellerAadhaar, sellerBankAccounts, sellers,
  supportCannedReplies, supportChats, supportMessages, supportTickets, users,
} from "@azadimart/database";
import { notifySeller } from "@azadimart/notify";
import { AppError, SUPPORT_STATUS_STAFF_LABELS, supportReplySchema, supportStaffUpdateSchema, supportTicketRef, toApiError, uuidSchema } from "@azadimart/shared";
import { and, count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSupportStaff, supportTeam } from "../../staff";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ ticketId: string }> };
type Db = Awaited<ReturnType<typeof requireSupportStaff>>["db"];

/** Who is asking, and what the team needs to know about them to help. */
async function requesterContext(db: Db, ticket: { requesterType: string; customerId: string | null; sellerId: string | null; requesterUserId: string | null }) {
  const user = ticket.requesterUserId ? (await db.select({ email: users.email, phone: users.phone, since: users.createdAt }).from(users).where(eq(users.id, ticket.requesterUserId)).limit(1))[0] : undefined;
  if (ticket.requesterType === "SELLER" && ticket.sellerId) {
    const sellerId = ticket.sellerId;
    const [seller, aadhaar, bank, live, tickets] = await Promise.all([
      db.select({ storeName: sellers.storeName, legalName: sellers.legalName, status: sellers.status, gstin: sellers.gstin, taxType: sellers.taxIdentityType, state: sellers.businessState, approvedAt: sellers.approvedAt, holdReason: sellers.payoutHoldReason }).from(sellers).where(eq(sellers.id, sellerId)).limit(1).then((r) => r[0]),
      db.select({ status: sellerAadhaar.status }).from(sellerAadhaar).where(eq(sellerAadhaar.sellerId, sellerId)).limit(1).then((r) => r[0]?.status ?? null),
      db.select({ status: sellerBankAccounts.verificationStatus, last4: sellerBankAccounts.accountNumberLast4, ifsc: sellerBankAccounts.ifsc }).from(sellerBankAccounts).where(and(eq(sellerBankAccounts.sellerId, sellerId), eq(sellerBankAccounts.isPrimary, true))).limit(1).then((r) => r[0] ?? null),
      db.select({ n: count() }).from(products).where(and(eq(products.sellerId, sellerId), eq(products.status, "LIVE"))).then((r) => Number(r[0]?.n ?? 0)),
      db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.sellerId, sellerId)).then((r) => Number(r[0]?.n ?? 0)),
    ]);
    return { kind: "SELLER" as const, email: user?.email ?? null, phone: user?.phone ?? null, since: user?.since ?? null, seller, aadhaarVerified: aadhaar === "VERIFIED", bank, liveProducts: live, ticketCount: tickets };
  }
  if (ticket.customerId) {
    const customerId = ticket.customerId;
    const [customer, recent, total, tickets] = await Promise.all([
      db.select({ name: customers.fullName }).from(customers).where(eq(customers.id, customerId)).limit(1).then((r) => r[0]),
      db.select({ id: orders.id, number: orders.orderNumber, status: orders.status, total: orders.grandTotalPaise, createdAt: orders.createdAt }).from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt)).limit(5),
      db.select({ n: count() }).from(orders).where(eq(orders.customerId, customerId)).then((r) => Number(r[0]?.n ?? 0)),
      db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.customerId, customerId)).then((r) => Number(r[0]?.n ?? 0)),
    ]);
    return { kind: "CUSTOMER" as const, email: user?.email ?? null, phone: user?.phone ?? null, since: user?.since ?? null, name: customer?.name ?? null, recentOrders: recent, orderCount: total, ticketCount: tickets };
  }
  return { kind: "UNKNOWN" as const, email: user?.email ?? null, phone: null, since: null };
}

async function loadTicket(db: Db, ticketId: string) {
  const ticket = (await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1))[0];
  if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found");
  const [messages, context, order, product, team, canned, chat] = await Promise.all([
    db.select({ id: supportMessages.id, authorType: supportMessages.authorType, isInternal: supportMessages.isInternal, message: supportMessages.message, createdAt: supportMessages.createdAt, senderUserId: supportMessages.senderUserId, senderEmail: users.email })
      .from(supportMessages).leftJoin(users, eq(users.id, supportMessages.senderUserId)).where(eq(supportMessages.ticketId, ticketId)).orderBy(supportMessages.createdAt),
    requesterContext(db, ticket),
    ticket.orderId ? (async () => {
      const o = (await db.select({ id: orders.id, number: orders.orderNumber, status: orders.status, total: orders.grandTotalPaise, createdAt: orders.createdAt, deliveredAt: orders.deliveredAt, cancellationReason: orders.cancellationReason, payment: payments.provider, paymentStatus: payments.status })
        .from(orders).leftJoin(payments, eq(payments.orderId, orders.id)).where(eq(orders.id, ticket.orderId!)).limit(1))[0];
      if (!o) return null;
      const items = await db.select({ title: orderItems.title, quantity: orderItems.quantity, unitPricePaise: orderItems.unitPricePaise, storeName: sellers.storeName })
        .from(orderItems).leftJoin(sellers, eq(sellers.id, orderItems.sellerId)).where(eq(orderItems.orderId, o.id));
      return { ...o, items };
    })() : null,
    ticket.productId ? db.select({ id: products.id, title: products.title, slug: products.slug, status: products.status }).from(products).where(eq(products.id, ticket.productId)).limit(1).then((r) => r[0] ?? null) : null,
    supportTeam(db),
    db.select({ id: supportCannedReplies.id, title: supportCannedReplies.title, body: supportCannedReplies.body }).from(supportCannedReplies).orderBy(supportCannedReplies.title),
    db.select({ engine: supportChats.engine }).from(supportChats).where(eq(supportChats.ticketId, ticketId)).limit(1).then((r) => r[0] ?? null),
  ]);
  const names = new Map(team.map((m) => [m.userId, m.name]));
  return {
    ticket,
    messages: messages.map((m) => ({ ...m, author: m.authorType === "STAFF" ? (names.get(m.senderUserId ?? "") ?? m.senderEmail ?? "Support") : m.authorType === "SYSTEM" ? "AzadiMart" : m.authorType === "BOT" ? "Assistant" : null })),
    context, order, product, team, canned, chatEngine: chat?.engine ?? null,
  };
}

/** Full ticket for the support desk; opening it clears the "new" flag. */
export async function GET(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const { db } = await requireSupportStaff(request);
    const ticketId = uuidSchema.parse((await params).ticketId);
    const data = await loadTicket(db, ticketId);
    if (data.ticket.staffUnread) await db.update(supportTickets).set({ staffUnread: false }).where(eq(supportTickets.id, ticketId));
    return NextResponse.json(data);
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Reply to the requester, or add an internal note. Sellers get an alert for replies. */
export async function POST(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const { db, userId } = await requireSupportStaff(request);
    const ticketId = uuidSchema.parse((await params).ticketId);
    const { message, internal } = supportReplySchema.parse(await request.json());
    const ticket = await addStaffMessage(db, userId, ticketId, message, internal);
    await db.insert(auditLogs).values({ actorUserId: userId, action: internal ? "SUPPORT_NOTE" : "SUPPORT_REPLY", entityType: "support_ticket", entityId: ticketId, metadata: { number: ticket.number } });
    if (!internal && ticket.sellerId) {
      await notifySeller(db, { sellerId: ticket.sellerId, kind: "SUPPORT_REPLY", dedupeKey: `SUPPORT_REPLY:${ticketId}:${Date.now()}`, href: `/help/tickets/${ticketId}`, title: `Support replied to ${supportTicketRef(ticket.number)}`, body: message.slice(0, 140) }).catch(() => false);
    }
    return NextResponse.json(await loadTicket(db, ticketId), { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Change status, priority, topic or assignee. */
export async function PATCH(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const { db, userId } = await requireSupportStaff(request);
    const ticketId = uuidSchema.parse((await params).ticketId);
    const input = supportStaffUpdateSchema.parse(await request.json());
    const before = (await db.select({ status: supportTickets.status, sellerId: supportTickets.sellerId, number: supportTickets.number }).from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1))[0];
    if (!before) throw new AppError("NOT_FOUND", "Ticket not found");
    if (input.assignedToUserId && !(await supportTeam(db)).some((m) => m.userId === input.assignedToUserId)) throw new AppError("VALIDATION_ERROR", "Choose someone from the support team");
    const now = new Date();
    const statusChanged = input.status && input.status !== before.status;
    await db.update(supportTickets).set({
      ...input,
      ...(statusChanged && (input.status === "RESOLVED" || input.status === "CLOSED") ? { resolvedAt: now, requesterUnread: true } : {}),
      ...(statusChanged && (input.status === "OPEN" || input.status === "IN_PROGRESS") ? { resolvedAt: null } : {}),
      updatedAt: now,
    }).where(eq(supportTickets.id, ticketId));
    if (statusChanged && (input.status === "RESOLVED" || input.status === "CLOSED")) {
      await db.insert(supportMessages).values({ ticketId, authorType: "SYSTEM", message: `Marked ${SUPPORT_STATUS_STAFF_LABELS[input.status!].toLowerCase()} by AzadiMart support. Reply here if you still need help.` });
      if (before.sellerId) await notifySeller(db, { sellerId: before.sellerId, kind: "SUPPORT_REPLY", dedupeKey: `SUPPORT_STATUS:${ticketId}:${input.status}`, href: `/help/tickets/${ticketId}`, title: `${supportTicketRef(before.number)} was ${input.status === "RESOLVED" ? "resolved" : "closed"}` }).catch(() => false);
    }
    await db.insert(auditLogs).values({ actorUserId: userId, action: "SUPPORT_TICKET_UPDATED", entityType: "support_ticket", entityId: ticketId, metadata: input });
    return NextResponse.json(await loadTicket(db, ticketId));
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
