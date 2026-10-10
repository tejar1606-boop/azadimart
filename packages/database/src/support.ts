import { AppError, defaultSupportPriority, supportCategoriesFor, type SupportTicketCreateInput } from "@azadimart/shared";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import { orderItems, orders } from "./schema/commerce";
import { products } from "./schema/catalog";
import { supportChats, supportMessages, supportTickets } from "./schema/support";

/** Who is asking for help: a signed-in customer or seller. */
export type SupportRequesterRef =
  | { type: "CUSTOMER"; userId: string; customerId: string }
  | { type: "SELLER"; userId: string; sellerId: string };

const ownedBy = (who: SupportRequesterRef) =>
  who.type === "CUSTOMER" ? eq(supportTickets.customerId, who.customerId) : eq(supportTickets.sellerId, who.sellerId);

/** Ticket fields a requester may see (no assignee, no internal flags). */
const requesterColumns = {
  id: supportTickets.id, number: supportTickets.number, category: supportTickets.category, subject: supportTickets.subject,
  status: supportTickets.status, orderId: supportTickets.orderId, productId: supportTickets.productId, body: supportTickets.body,
  lastMessageAt: supportTickets.lastMessageAt, lastReplyBy: supportTickets.lastReplyBy, unread: supportTickets.requesterUnread,
  rating: supportTickets.rating, createdAt: supportTickets.createdAt, resolvedAt: supportTickets.resolvedAt,
};

/** The order must be the customer's own, or contain the seller's items. */
async function assertOrderAccess(db: Database, who: SupportRequesterRef, orderId: string) {
  const ok = who.type === "CUSTOMER"
    ? (await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, who.customerId))).limit(1))[0]
    : (await db.select({ id: orderItems.orderId }).from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.sellerId, who.sellerId))).limit(1))[0];
  if (!ok) throw new AppError("NOT_FOUND", "Order not found");
}

/** Sellers may only raise tickets about their own products; customers about live ones. */
async function assertProductAccess(db: Database, who: SupportRequesterRef, productId: string) {
  const row = (await db.select({ sellerId: products.sellerId, status: products.status }).from(products).where(eq(products.id, productId)).limit(1))[0];
  if (!row || (who.type === "SELLER" ? row.sellerId !== who.sellerId : row.status !== "LIVE")) throw new AppError("NOT_FOUND", "Product not found");
}

export async function createSupportTicket(db: Database, who: SupportRequesterRef, input: SupportTicketCreateInput, channel: "CHAT" | "FORM") {
  if (!supportCategoriesFor(who.type).includes(input.category)) throw new AppError("VALIDATION_ERROR", "Choose a topic from the list");
  if (input.orderId) await assertOrderAccess(db, who, input.orderId);
  if (input.productId) await assertProductAccess(db, who, input.productId);
  const chat = input.chatId
    ? (await db.select().from(supportChats).where(and(eq(supportChats.id, input.chatId), eq(supportChats.userId, who.userId))).limit(1))[0]
    : undefined;
  const [ticket] = await db.insert(supportTickets).values({
    requesterType: who.type, requesterUserId: who.userId,
    customerId: who.type === "CUSTOMER" ? who.customerId : null, sellerId: who.type === "SELLER" ? who.sellerId : null,
    orderId: input.orderId, productId: input.productId, category: input.category, priority: defaultSupportPriority(input.category),
    channel: chat ? "CHAT" : channel, subject: input.subject, body: input.message,
  }).returning();
  await db.insert(supportMessages).values({ ticketId: ticket!.id, senderUserId: who.userId, authorType: "REQUESTER", message: input.message });
  if (chat?.messages.length) {
    // The team sees what the assistant already said, so nobody has to repeat themselves.
    const transcript = chat.messages.map((m) => `${m.role === "user" ? "Requester" : "Assistant"}: ${m.content}`).join("\n\n");
    await db.insert(supportMessages).values({ ticketId: ticket!.id, authorType: "SYSTEM", isInternal: true, message: "Help chat before this ticket:\n\n" + transcript.slice(0, 12_000) });
    await db.update(supportChats).set({ ticketId: ticket!.id, updatedAt: new Date() }).where(eq(supportChats.id, chat.id));
  }
  return ticket!;
}

export async function listRequesterTickets(db: Database, who: SupportRequesterRef) {
  return db.select(requesterColumns).from(supportTickets).where(ownedBy(who)).orderBy(desc(supportTickets.lastMessageAt)).limit(100);
}

export async function requesterUnreadCount(db: Database, who: SupportRequesterRef): Promise<number> {
  const [row] = await db.select({ n: count() }).from(supportTickets).where(and(ownedBy(who), eq(supportTickets.requesterUnread, true)));
  return Number(row?.n ?? 0);
}

/** A requester's own ticket with its public messages; opening it marks replies as read. */
export async function getRequesterTicket(db: Database, who: SupportRequesterRef, ticketId: string) {
  const ticket = (await db.select(requesterColumns).from(supportTickets).where(and(eq(supportTickets.id, ticketId), ownedBy(who))).limit(1))[0];
  if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found");
  const messages = await db.select({ id: supportMessages.id, authorType: supportMessages.authorType, message: supportMessages.message, createdAt: supportMessages.createdAt })
    .from(supportMessages).where(and(eq(supportMessages.ticketId, ticketId), eq(supportMessages.isInternal, false))).orderBy(supportMessages.createdAt);
  if (ticket.unread) await db.update(supportTickets).set({ requesterUnread: false }).where(eq(supportTickets.id, ticketId));
  return { ticket: { ...ticket, unread: false }, messages };
}

/** The requester writes again: the ticket goes back to the team's queue. */
export async function addRequesterMessage(db: Database, who: SupportRequesterRef, ticketId: string, message: string) {
  const ticket = (await db.select({ id: supportTickets.id, status: supportTickets.status }).from(supportTickets).where(and(eq(supportTickets.id, ticketId), ownedBy(who))).limit(1))[0];
  if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found");
  if (ticket.status === "CLOSED") throw new AppError("CONFLICT", "This ticket is closed. Please start a new one.");
  const now = new Date();
  await db.insert(supportMessages).values({ ticketId, senderUserId: who.userId, authorType: "REQUESTER", message });
  await db.update(supportTickets).set({
    status: ticket.status === "IN_PROGRESS" ? "IN_PROGRESS" : "OPEN", resolvedAt: null,
    lastMessageAt: now, lastReplyBy: "REQUESTER", staffUnread: true, updatedAt: now,
  }).where(eq(supportTickets.id, ticketId));
}

/** The requester marks the problem solved and/or rates the help. */
export async function updateRequesterTicket(db: Database, who: SupportRequesterRef, ticketId: string, input: { status?: "RESOLVED"; rating?: number; ratingNote?: string }) {
  const ticket = (await db.select({ id: supportTickets.id, status: supportTickets.status }).from(supportTickets).where(and(eq(supportTickets.id, ticketId), ownedBy(who))).limit(1))[0];
  if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found");
  const now = new Date();
  const resolving = input.status === "RESOLVED" && !["RESOLVED", "CLOSED"].includes(ticket.status);
  await db.update(supportTickets).set({
    ...(resolving ? { status: "RESOLVED" as const, resolvedAt: now } : {}),
    ...(input.rating ? { rating: input.rating, ratingNote: input.ratingNote || null } : {}),
    updatedAt: now,
  }).where(eq(supportTickets.id, ticketId));
  if (resolving) await db.insert(supportMessages).values({ ticketId, authorType: "SYSTEM", message: "Marked as resolved by the requester." });
}

/**
 * A support-team reply (or internal note). A public reply hands the ticket
 * back to the requester ("Waiting for your reply") and flags it unread for them.
 */
export async function addStaffMessage(db: Database, staffUserId: string, ticketId: string, message: string, internal: boolean) {
  const ticket = (await db.select({ id: supportTickets.id, number: supportTickets.number, status: supportTickets.status, sellerId: supportTickets.sellerId, subject: supportTickets.subject, firstResponseAt: supportTickets.firstResponseAt })
    .from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1))[0];
  if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found");
  const now = new Date();
  await db.insert(supportMessages).values({ ticketId, senderUserId: staffUserId, authorType: "STAFF", isInternal: internal, message });
  if (internal) {
    await db.update(supportTickets).set({ updatedAt: now }).where(eq(supportTickets.id, ticketId));
  } else {
    await db.update(supportTickets).set({
      status: ["RESOLVED", "CLOSED"].includes(ticket.status) ? ticket.status : "WAITING",
      firstResponseAt: ticket.firstResponseAt ?? now, lastMessageAt: now, lastReplyBy: "STAFF",
      requesterUnread: true, staffUnread: false, assignedToUserId: sql`coalesce(${supportTickets.assignedToUserId}, ${staffUserId}::uuid)`, updatedAt: now,
    }).where(eq(supportTickets.id, ticketId));
  }
  return ticket;
}

/** Saves a help-chat turn (creates the chat on the first message). Returns the chat id. */
export async function saveSupportChat(db: Database, input: {
  chatId: string | null; requesterType: "CUSTOMER" | "SELLER"; userId: string | null; customerId?: string | null; sellerId?: string | null;
  turn: Array<{ role: "user" | "assistant"; content: string }>; engine: "GUIDED" | "AI";
}): Promise<string> {
  const at = new Date().toISOString();
  const turn = input.turn.map((m) => ({ ...m, content: m.content.slice(0, 4000), at }));
  if (input.chatId) {
    // Only the same person (or the same guest browser, with no user) may continue a chat.
    const owner = input.userId ? eq(supportChats.userId, input.userId) : sql`${supportChats.userId} is null`;
    const updated = await db.update(supportChats)
      .set({ messages: sql`(${supportChats.messages} || ${JSON.stringify(turn)}::jsonb)`, engine: input.engine, updatedAt: new Date() })
      .where(and(eq(supportChats.id, input.chatId), eq(supportChats.requesterType, input.requesterType), owner, sql`jsonb_array_length(${supportChats.messages}) < 200`))
      .returning({ id: supportChats.id });
    if (updated[0]) return updated[0].id;
  }
  const [chat] = await db.insert(supportChats).values({
    requesterType: input.requesterType, userId: input.userId, customerId: input.customerId ?? null, sellerId: input.sellerId ?? null, messages: turn, engine: input.engine,
  }).returning({ id: supportChats.id });
  return chat!.id;
}

/** Ticket ids for a list of orders (used to show "already reported" hints). */
export async function openTicketsForOrders(db: Database, orderIds: string[]) {
  if (!orderIds.length) return [];
  return db.select({ id: supportTickets.id, orderId: supportTickets.orderId, number: supportTickets.number })
    .from(supportTickets).where(and(inArray(supportTickets.orderId, orderIds), inArray(supportTickets.status, ["OPEN", "IN_PROGRESS", "WAITING"])));
}
