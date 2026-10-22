import { AppError } from "@azadimart/shared";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import { callAgents, calls, customers, orders, sellers, supportTickets, users, type CallEvent } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;

/** Indian numbers are stored as their last 10 digits. */
export const normalizePhone = (raw: string) => raw.replace(/\D/g, "").slice(-10);
/** An agent whose Call Centre screen hasn't checked in for this long is offline. */
export const AGENT_STALE_MS = 45_000;
/** How long an incoming call rings one agent before trying the next. */
export const RING_TIMEOUT_MS = 25_000;
/** How long a caller waits in the queue before the call counts as missed. */
export const MAX_QUEUE_WAIT_MS = 120_000;
/** Test provider: the customer "picks up" an outgoing call after this long. */
export const TEST_ANSWER_MS = 3_000;
const ACTIVE = ["RINGING", "IN_PROGRESS"] as const;

const event = (type: string, byUserId?: string | null, note?: string): CallEvent => ({ at: new Date().toISOString(), type, byUserId: byUserId ?? null, ...(note ? { note } : {}) });
const pushEvent = (e: CallEvent) => sql`${calls.events} || ${JSON.stringify([e])}::jsonb`;

/** Who is calling: the customer or seller with this number, their recent orders and open tickets. */
export async function lookupCaller(db: Db, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (phone.length !== 10) return { phone, customer: null, seller: null, orders: [], openTickets: [], previousCalls: 0 };
  const user = (await db.select({ id: users.id, role: users.role, email: users.email }).from(users).where(sql`right(regexp_replace(${users.phone}, '\\D', '', 'g'), 10) = ${phone}`).limit(1))[0];
  const customer = user ? (await db.select({ id: customers.id, name: customers.fullName }).from(customers).where(eq(customers.userId, user.id)).limit(1))[0] ?? null : null;
  const seller = user ? (await db.select({ id: sellers.id, name: sellers.storeName }).from(sellers).where(eq(sellers.userId, user.id)).limit(1))[0] ?? null : null;
  const recentOrders = customer ? await db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, totalPaise: orders.grandTotalPaise, createdAt: orders.createdAt }).from(orders).where(eq(orders.customerId, customer.id)).orderBy(desc(orders.createdAt)).limit(4) : [];
  const openTickets = customer || seller ? await db.select({ id: supportTickets.id, number: supportTickets.number, subject: supportTickets.subject, status: supportTickets.status })
    .from(supportTickets).where(and(customer ? eq(supportTickets.customerId, customer.id) : eq(supportTickets.sellerId, seller!.id), inArray(supportTickets.status, ["OPEN", "IN_PROGRESS", "WAITING"]))).orderBy(desc(supportTickets.lastMessageAt)).limit(4) : [];
  const previousCalls = (await db.select({ n: sql<number>`count(*)::int` }).from(calls).where(eq(calls.customerPhone, phone)))[0]?.n ?? 0;
  return { phone, customer: customer ? { ...customer, email: user!.email } : null, seller, orders: recentOrders, openTickets, previousCalls };
}

export async function setAgentStatus(db: Db, userId: string, status: "AVAILABLE" | "AWAY" | "OFFLINE") {
  const now = new Date();
  await db.insert(callAgents).values({ userId, status, lastSeenAt: now }).onConflictDoUpdate({ target: callAgents.userId, set: { status, lastSeenAt: now, updatedAt: now } });
  if (status !== "AVAILABLE") {
    // Going away while a call is ringing for you passes it to the next agent.
    const ringing = await db.select({ id: calls.id }).from(calls).where(and(eq(calls.agentUserId, userId), eq(calls.status, "RINGING"), eq(calls.direction, "INBOUND")));
    for (const c of ringing) await declineCall(db, c.id, userId, "Agent went away");
  }
  await routeQueuedCalls(db);
}

/** Free agents for an incoming call, longest idle first. */
async function freeAgents(db: Db, exclude: string[]) {
  const since = new Date(Date.now() - AGENT_STALE_MS);
  const busy = db.select({ id: calls.agentUserId }).from(calls).where(and(inArray(calls.status, [...ACTIVE]), sql`${calls.agentUserId} is not null`));
  const rows = await db.select({ userId: callAgents.userId }).from(callAgents)
    .where(and(eq(callAgents.status, "AVAILABLE"), gte(callAgents.lastSeenAt, since), sql`${callAgents.userId} not in (${busy})`))
    .orderBy(sql`${callAgents.lastCallEndedAt} asc nulls first`);
  return rows.map((r) => r.userId).filter((id) => !exclude.includes(id));
}

/** Offers waiting calls to free agents, oldest call first. */
export async function routeQueuedCalls(db: Db) {
  const queued = await db.select().from(calls).where(and(eq(calls.status, "QUEUED"), eq(calls.direction, "INBOUND"))).orderBy(asc(calls.createdAt));
  for (const c of queued) {
    const [agent] = await freeAgents(db, c.skippedAgentIds);
    if (!agent) continue;
    await db.update(calls).set({ status: "RINGING", agentUserId: agent, offeredAt: new Date(), events: pushEvent(event("OFFERED", agent)), updatedAt: new Date() })
      .where(and(eq(calls.id, c.id), eq(calls.status, "QUEUED")));
  }
}

/** A new incoming call (from the provider, or simulated): queued, then rung at a free agent. */
export async function createInboundCall(db: Db, input: { phone: string; provider: string; providerCallId?: string | null; ivrChoice?: string | null; businessNumber?: string | null }) {
  const caller = await lookupCaller(db, input.phone);
  const row = (await db.insert(calls).values({
    direction: "INBOUND", status: "QUEUED", provider: input.provider, providerCallId: input.providerCallId ?? null, customerPhone: caller.phone,
    businessNumber: input.businessNumber ?? null, ivrChoice: input.ivrChoice ?? null, customerId: caller.customer?.id ?? null, sellerId: caller.seller?.id ?? null,
    orderId: caller.orders[0]?.id ?? null, events: [event("RECEIVED", null, input.ivrChoice ?? undefined)],
  }).onConflictDoNothing({ target: [calls.provider, calls.providerCallId] }).returning())[0];
  if (row) await routeQueuedCalls(db);
  return row ?? null;
}

/**
 * Time-based changes, run whenever an agent's screen checks in: a call that
 * rang out goes to the next agent, a caller who waited too long becomes a
 * missed call, and (test provider only) customers answer outgoing calls.
 */
export async function syncCalls(db: Db) {
  const now = Date.now();
  const rangOut = await db.select().from(calls).where(and(eq(calls.status, "RINGING"), eq(calls.direction, "INBOUND"), lt(calls.offeredAt, new Date(now - RING_TIMEOUT_MS))));
  for (const c of rangOut) await declineCall(db, c.id, c.agentUserId, "Rang out");
  await db.update(calls).set({ status: "MISSED", endedAt: new Date(), agentUserId: null, waitSeconds: sql`extract(epoch from now() - ${calls.createdAt})::int`, events: pushEvent(event("MISSED")), updatedAt: new Date() })
    .where(and(eq(calls.status, "QUEUED"), lt(calls.createdAt, new Date(now - MAX_QUEUE_WAIT_MS))));
  await db.update(calls).set({ status: "IN_PROGRESS", answeredAt: new Date(), events: pushEvent(event("ANSWERED_BY_CUSTOMER")), updatedAt: new Date() })
    .where(and(eq(calls.status, "RINGING"), eq(calls.direction, "OUTBOUND"), eq(calls.provider, "test"), lt(calls.createdAt, new Date(now - TEST_ANSWER_MS))));
  await routeQueuedCalls(db);
}

async function mine(db: Db, callId: string, userId: string) {
  const c = (await db.select().from(calls).where(eq(calls.id, callId)).limit(1))[0];
  if (!c) throw new AppError("NOT_FOUND", "Call not found");
  if (c.agentUserId !== userId) throw new AppError("FORBIDDEN", "This call is with another agent");
  return c;
}

export async function acceptCall(db: Db, callId: string, userId: string) {
  const c = await mine(db, callId, userId);
  const updated = (await db.update(calls).set({ status: "IN_PROGRESS", answeredAt: new Date(), waitSeconds: sql`extract(epoch from now() - ${calls.createdAt})::int`, events: pushEvent(event("ANSWERED", userId)), updatedAt: new Date() })
    .where(and(eq(calls.id, c.id), eq(calls.status, "RINGING"), eq(calls.direction, "INBOUND"))).returning())[0];
  if (!updated) throw new AppError("CONFLICT", "This call is no longer ringing");
  return updated;
}

/** The agent declines (or lets it ring out): the call goes back to the queue for someone else. */
export async function declineCall(db: Db, callId: string, userId: string | null, reason = "Declined") {
  await db.update(calls).set({
    status: "QUEUED", agentUserId: null, offeredAt: null, updatedAt: new Date(),
    skippedAgentIds: userId ? sql`array_append(${calls.skippedAgentIds}, ${userId}::uuid)` : calls.skippedAgentIds, events: pushEvent(event("SKIPPED", userId, reason)),
  }).where(and(eq(calls.id, callId), eq(calls.status, "RINGING"), eq(calls.direction, "INBOUND")));
  await routeQueuedCalls(db);
}

/** Ends a call. An answered call is COMPLETED; an outgoing call nobody picked up is NO_ANSWER. */
export async function endCall(db: Db, callId: string, userId: string) {
  const c = await mine(db, callId, userId);
  if (!(ACTIVE as readonly string[]).includes(c.status)) return c;
  if (c.direction === "INBOUND" && c.status === "RINGING") { await declineCall(db, c.id, userId); return c; }
  const now = new Date();
  const answered = c.status === "IN_PROGRESS";
  const updated = (await db.update(calls).set({
    status: answered ? "COMPLETED" : "NO_ANSWER", endedAt: now, durationSeconds: answered && c.answeredAt ? Math.round((now.getTime() - c.answeredAt.getTime()) / 1000) : 0,
    events: pushEvent(event("ENDED", userId)), updatedAt: now,
  }).where(and(eq(calls.id, c.id), inArray(calls.status, [...ACTIVE]))).returning())[0] ?? c;
  await db.update(callAgents).set({ lastCallEndedAt: now, updatedAt: now }).where(eq(callAgents.userId, userId));
  // A finished call back to someone we missed clears them from the callback list.
  if (answered && c.direction === "OUTBOUND") {
    await db.update(calls).set({ callbackDoneAt: now, callbackByUserId: userId, updatedAt: now }).where(and(eq(calls.customerPhone, c.customerPhone), eq(calls.status, "MISSED"), isNull(calls.callbackDoneAt)));
  }
  await routeQueuedCalls(db);
  return updated;
}

/** An outgoing call from an agent's softphone. The provider rings the agent's softphone, then the customer. */
export async function startOutboundCall(db: Db, input: { userId: string; phone: string; provider: string; businessNumber?: string | null; orderId?: string | null; ticketId?: string | null }) {
  const phone = normalizePhone(input.phone);
  if (!/^[6-9]\d{9}$/.test(phone)) throw new AppError("VALIDATION_ERROR", "Enter a 10-digit Indian mobile number");
  const busy = (await db.select({ id: calls.id }).from(calls).where(and(eq(calls.agentUserId, input.userId), inArray(calls.status, [...ACTIVE]))).limit(1))[0];
  if (busy) throw new AppError("CONFLICT", "Finish your current call first");
  const caller = await lookupCaller(db, phone);
  return (await db.insert(calls).values({
    direction: "OUTBOUND", status: "RINGING", provider: input.provider, customerPhone: phone, businessNumber: input.businessNumber ?? null,
    customerId: caller.customer?.id ?? null, sellerId: caller.seller?.id ?? null, orderId: input.orderId ?? caller.orders[0]?.id ?? null, ticketId: input.ticketId ?? null,
    agentUserId: input.userId, offeredAt: new Date(), events: [event("DIALLED", input.userId)],
  }).returning())[0]!;
}

/** Notes and outcome after the call (any agent on the support desk may add them). */
export async function saveCallNotes(db: Db, callId: string, userId: string, input: { outcome?: string | null; notes?: string | null; orderId?: string | null; ticketId?: string | null }) {
  const updated = (await db.update(calls).set({
    ...(input.outcome !== undefined ? { outcome: input.outcome as typeof calls.$inferInsert.outcome } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
    ...(input.ticketId !== undefined ? { ticketId: input.ticketId } : {}),
    events: pushEvent(event("NOTES", userId)), updatedAt: new Date(),
  }).where(eq(calls.id, callId)).returning())[0];
  if (!updated) throw new AppError("NOT_FOUND", "Call not found");
  return updated;
}

/** Removes a missed call from the callback list without calling (e.g. spam, already sorted on chat). */
export async function dismissMissedCall(db: Db, callId: string, userId: string) {
  const updated = (await db.update(calls).set({ callbackDoneAt: new Date(), callbackByUserId: userId, events: pushEvent(event("CALLBACK_DISMISSED", userId)), updatedAt: new Date() })
    .where(and(eq(calls.id, callId), eq(calls.status, "MISSED"), isNull(calls.callbackDoneAt))).returning())[0];
  if (!updated) throw new AppError("CONFLICT", "This call is not waiting for a callback");
}

/** What an agent's screen needs every few seconds: their status, their current call (with caller details) and the queue. */
export async function agentState(db: Db, userId: string) {
  await db.update(callAgents).set({ lastSeenAt: new Date() }).where(eq(callAgents.userId, userId));
  await syncCalls(db);
  const agent = (await db.select().from(callAgents).where(eq(callAgents.userId, userId)).limit(1))[0];
  const current = (await db.select().from(calls).where(and(eq(calls.agentUserId, userId), inArray(calls.status, [...ACTIVE]))).orderBy(desc(calls.createdAt)).limit(1))[0] ?? null;
  const [queue, missed, online] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(calls).where(eq(calls.status, "QUEUED")).then((r) => r[0]?.n ?? 0),
    db.select({ n: sql<number>`count(*)::int` }).from(calls).where(and(eq(calls.status, "MISSED"), isNull(calls.callbackDoneAt))).then((r) => r[0]?.n ?? 0),
    db.select({ n: sql<number>`count(*)::int` }).from(callAgents).where(and(eq(callAgents.status, "AVAILABLE"), gte(callAgents.lastSeenAt, new Date(Date.now() - AGENT_STALE_MS)))).then((r) => r[0]?.n ?? 0),
  ]);
  return {
    status: agent?.status ?? "OFFLINE",
    current: current ? { ...current, caller: await lookupCaller(db, current.customerPhone) } : null,
    queue, missed, agentsOnline: online,
  };
}

/** Today's numbers (India time) for the Call Centre dashboard, overall and per agent. */
export async function callStats(db: Db, since: Date) {
  const rows = await db.select({
    agentUserId: calls.agentUserId, email: users.email, direction: calls.direction, status: calls.status,
    n: sql<number>`count(*)::int`, talk: sql<number>`coalesce(sum(${calls.durationSeconds}), 0)::int`, wait: sql<number>`coalesce(sum(${calls.waitSeconds}), 0)::int`,
  }).from(calls).leftJoin(users, eq(users.id, calls.agentUserId)).where(gte(calls.createdAt, since)).groupBy(calls.agentUserId, users.email, calls.direction, calls.status);
  const sum = (f: (r: (typeof rows)[number]) => boolean, k: "n" | "talk" | "wait" = "n") => rows.filter(f).reduce((a, r) => a + r[k], 0);
  const answeredIn = sum((r) => r.direction === "INBOUND" && r.status === "COMPLETED");
  const agents = [...new Set(rows.filter((r) => r.agentUserId).map((r) => r.agentUserId!))].map((id) => {
    const mineRows = (f: (r: (typeof rows)[number]) => boolean, k: "n" | "talk" = "n") => sum((r) => r.agentUserId === id && f(r), k);
    return { userId: id, email: rows.find((r) => r.agentUserId === id)?.email ?? "", inbound: mineRows((r) => r.direction === "INBOUND" && r.status === "COMPLETED"), outbound: mineRows((r) => r.direction === "OUTBOUND"), talkSeconds: mineRows(() => true, "talk") };
  });
  return {
    inboundTotal: sum((r) => r.direction === "INBOUND"), inboundAnswered: answeredIn, missed: sum((r) => r.status === "MISSED"),
    outbound: sum((r) => r.direction === "OUTBOUND"), outboundConnected: sum((r) => r.direction === "OUTBOUND" && r.status === "COMPLETED"),
    avgWaitSeconds: answeredIn ? Math.round(sum((r) => r.direction === "INBOUND" && r.status === "COMPLETED", "wait") / answeredIn) : 0,
    avgTalkSeconds: sum((r) => r.status === "COMPLETED") ? Math.round(sum((r) => r.status === "COMPLETED", "talk") / sum((r) => r.status === "COMPLETED")) : 0,
    agents,
  };
}
