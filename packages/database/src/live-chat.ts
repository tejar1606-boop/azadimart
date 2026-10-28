import { createHash, randomBytes } from "node:crypto";
import { AppError, LIVE_CHAT_TIMING, LIVE_HOLD_REASONS, estimateLiveWait, isStaffPermission, supportCategoryLabel, type LiveChatAttachment } from "@azadimart/shared";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { Database } from "./client";
import { customers, roles, staffMembers, users } from "./schema/identity";
import { liveChatAgents, liveChatMessages, liveChats } from "./schema/live-chat";
import { sellers } from "./schema/sellers";
import { supportChats, supportMessages, supportTickets } from "./schema/support";

/** Who is chatting: a signed-in customer or seller, or a guest holding the chat key. */
export type LiveRequester =
  | { type: "CUSTOMER"; userId: string; customerId: string }
  | { type: "SELLER"; userId: string; sellerId: string }
  | { type: "GUEST"; token: string | null };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const secondsAgo = (s: number) => new Date(Date.now() - s * 1000);

function owned(who: LiveRequester): SQL {
  if (who.type === "CUSTOMER") return eq(liveChats.customerId, who.customerId);
  if (who.type === "SELLER") return eq(liveChats.sellerId, who.sellerId);
  if (!who.token) return sql`false`;
  return and(eq(liveChats.requesterType, "GUEST"), eq(liveChats.guestTokenHash, hashToken(who.token)))!;
}

/** Display name of each team member (staff record, else the email). */
async function agentNames(db: Database, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: users.id, email: users.email, name: staffMembers.displayName }).from(users).leftJoin(staffMembers, eq(staffMembers.userId, users.id)).where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name || r.email.split("@")[0] || "Support"]));
}

/**
 * Agents who can take chats right now: console open (recent heartbeat),
 * status Online, account active and their role includes Live chat. Owners
 * and admins without a team role count too.
 */
export async function availableAgents(db: Database) {
  const rows = await db.select({
    userId: liveChatAgents.userId, maxChats: liveChatAgents.maxChats, status: liveChatAgents.status,
    role: users.role, userStatus: users.status, memberActive: staffMembers.isActive, permissions: roles.permissions, name: staffMembers.displayName, email: users.email,
  }).from(liveChatAgents).innerJoin(users, eq(users.id, liveChatAgents.userId))
    .leftJoin(staffMembers, eq(staffMembers.userId, users.id)).leftJoin(roles, eq(roles.id, staffMembers.roleId))
    .where(and(gt(liveChatAgents.lastSeenAt, secondsAgo(LIVE_CHAT_TIMING.agentHeartbeat)), eq(users.status, "ACTIVE")));
  const allowed = rows.filter((r) => r.permissions ? r.memberActive !== false && r.permissions.filter(isStaffPermission).includes("livechat") : r.role === "ADMIN" || r.role === "SUPER_ADMIN");
  const load = allowed.length ? await db.select({ agent: liveChats.assignedAgentId, n: sql<number>`count(*)::int` }).from(liveChats)
    .where(and(eq(liveChats.status, "ACTIVE"), isNull(liveChats.heldAt), inArray(liveChats.assignedAgentId, allowed.map((a) => a.userId)))).groupBy(liveChats.assignedAgentId) : [];
  return allowed.map((a) => ({ userId: a.userId, name: a.name || a.email.split("@")[0] || "Support", status: a.status, maxChats: a.maxChats, active: Number(load.find((l) => l.agent === a.userId)?.n ?? 0) }));
}

async function system(db: Database, chatId: string, text: string) {
  await db.insert(liveChatMessages).values({ chatId, author: "SYSTEM", body: text });
}

let lastSweep = 0;
/**
 * Keeps the queue moving: ends chats whose requester left, puts chats back
 * in the queue when their agent went offline, and hands waiting chats to the
 * least busy online agent. Cheap enough to run on every console and requester
 * check; throttled to once a second per server.
 */
export async function sweepLiveChats(db: Database, force = false) {
  const now = Date.now();
  if (!force && now - lastSweep < 1000) return;
  lastSweep = now;

  // Requesters who closed the page while waiting, or went quiet for long in a chat.
  const abandoned = await db.update(liveChats).set({ status: "ENDED", endedAt: new Date(), endedBy: "SYSTEM", endReason: "ABANDONED", updatedAt: new Date() })
    .where(and(eq(liveChats.status, "WAITING"), lt(liveChats.requesterSeenAt, secondsAgo(LIVE_CHAT_TIMING.requesterGone)))).returning({ id: liveChats.id });
  for (const c of abandoned) await system(db, c.id, "The chat ended because you left before an agent joined.");
  // Chats on hold wait for the update instead. One that was on hold and whose requester has gone
  // since becomes a support request, so the agent's update still reaches them.
  const goneAfterHold = await db.select().from(liveChats)
    .where(and(eq(liveChats.status, "ACTIVE"), isNull(liveChats.heldAt), isNotNull(liveChats.holdReason), lt(liveChats.requesterSeenAt, secondsAgo(LIVE_CHAT_TIMING.requesterIdleEnd))));
  for (const c of goneAfterHold) await chatToTicket(db, c, "This chat was on hold and the customer had left by the time we replied. Please follow up.", c.assignedAgentId);
  const idle = await db.update(liveChats).set({ status: "ENDED", endedAt: new Date(), endedBy: "SYSTEM", endReason: "IDLE", updatedAt: new Date() })
    .where(and(eq(liveChats.status, "ACTIVE"), isNull(liveChats.heldAt), lt(liveChats.requesterSeenAt, secondsAgo(LIVE_CHAT_TIMING.requesterIdleEnd)))).returning({ id: liveChats.id });
  for (const c of idle) await system(db, c.id, "The chat ended after a long time without activity.");
  // On hold too long: a support request so it isn't forgotten.
  const overdue = await db.select().from(liveChats).where(and(eq(liveChats.status, "ACTIVE"), lt(liveChats.heldAt, secondsAgo(LIVE_CHAT_TIMING.holdMax))));
  for (const c of overdue) await chatToTicket(db, c, `This chat was on hold for over ${LIVE_CHAT_TIMING.holdMax / 3600} hours (${LIVE_HOLD_REASONS[c.holdReason ?? "OTHER"].toLowerCase()}${c.holdNote ? `: ${c.holdNote}` : ""}). Please follow up.`, c.assignedAgentId);

  const agents = await availableAgents(db);
  // Active chats whose agent is no longer around go back to the front of the queue.
  // Agents who switched to Offline hand their chats on straight away (Away keeps them).
  const present = agents.filter((a) => a.status !== "OFFLINE").map((a) => a.userId);
  const orphaned = await db.select({ id: liveChats.id, agent: liveChats.assignedAgentId }).from(liveChats)
    .leftJoin(liveChatAgents, eq(liveChatAgents.userId, liveChats.assignedAgentId))
    .where(and(eq(liveChats.status, "ACTIVE"), isNull(liveChats.heldAt), sql`(${liveChatAgents.lastSeenAt} is null or ${liveChatAgents.lastSeenAt} < ${secondsAgo(LIVE_CHAT_TIMING.agentGoneRequeue)} or ${liveChatAgents.status} = 'OFFLINE')`));
  for (const c of orphaned.filter((o) => !o.agent || !present.includes(o.agent))) {
    const moved = await db.update(liveChats).set({ status: "WAITING", assignedAgentId: null, updatedAt: new Date() }).where(and(eq(liveChats.id, c.id), eq(liveChats.status, "ACTIVE"))).returning({ id: liveChats.id });
    if (moved.length) await system(db, c.id, "Your agent got disconnected. Connecting you to the next available agent…");
  }

  // Hand waiting chats, oldest first, to the least busy agent who is Online and has room.
  const free = agents.filter((a) => a.status === "ONLINE" && a.active < a.maxChats);
  if (!free.length) return;
  const waiting = await db.select({ id: liveChats.id }).from(liveChats).where(eq(liveChats.status, "WAITING")).orderBy(asc(liveChats.queuedAt)).limit(50);
  for (const chat of waiting) {
    const agent = free.filter((a) => a.active < a.maxChats).sort((a, b) => a.active / a.maxChats - b.active / b.maxChats || a.active - b.active)[0];
    if (!agent) break;
    const taken = await db.update(liveChats).set({ status: "ACTIVE", assignedAgentId: agent.userId, acceptedAt: sql`coalesce(${liveChats.acceptedAt}, now())`, updatedAt: new Date() })
      .where(and(eq(liveChats.id, chat.id), eq(liveChats.status, "WAITING"))).returning({ id: liveChats.id });
    if (taken.length) { agent.active++; await system(db, chat.id, `${agent.name} joined the chat`); }
  }
}

async function requesterName(db: Database, chat: { requesterType: string; customerId: string | null; sellerId: string | null; guestName: string | null }) {
  if (chat.customerId) return (await db.select({ n: customers.fullName }).from(customers).where(eq(customers.id, chat.customerId)).limit(1))[0]?.n ?? "Customer";
  if (chat.sellerId) return (await db.select({ n: sellers.storeName }).from(sellers).where(eq(sellers.id, chat.sellerId)).limit(1))[0]?.n ?? "Seller";
  return chat.guestName ?? "Guest";
}

/** Online agents and the expected wait for a new chat (null wait = nobody online). */
export async function liveChatAvailability(db: Database) {
  await sweepLiveChats(db);
  const agents = (await availableAgents(db)).filter((a) => a.status === "ONLINE");
  const [w] = await db.select({ n: sql<number>`count(*)::int` }).from(liveChats).where(eq(liveChats.status, "WAITING"));
  const freeSlots = agents.reduce((s, a) => s + Math.max(0, a.maxChats - a.active), 0);
  return { online: agents.length, waitSeconds: estimateLiveWait(Number(w?.n ?? 0) + 1, freeSlots, agents.length) };
}

/** Starts a chat (or returns the requester's open one). Guests get a chat key to keep. */
/** The assistant chat to attach, if it belongs to this requester (guests' assistant chats have no user). */
async function ownAssistantChat(db: Database, who: LiveRequester, id: string | null | undefined) {
  if (!id) return null;
  const row = (await db.select({ id: supportChats.id, userId: supportChats.userId }).from(supportChats).where(eq(supportChats.id, id)).limit(1))[0];
  if (!row) return null;
  return (who.type === "GUEST" ? row.userId === null : row.userId === who.userId) ? row.id : null;
}

/** What the shopper or seller told the assistant before the hand-over. */
async function assistantTranscript(db: Database, id: string | null) {
  if (!id) return [];
  const row = (await db.select({ messages: supportChats.messages }).from(supportChats).where(eq(supportChats.id, id)).limit(1))[0];
  // "menu" is the greeting the chat asks for on open, not something the person said.
  return (row?.messages ?? []).filter((m) => !(m.role === "user" && m.content === "menu")).slice(-30).map((m) => ({ role: m.role, content: m.content }));
}

export async function startLiveChat(db: Database, who: LiveRequester, input: { topic: string; message: string; name?: string; contact?: string; page?: string; assistantChatId?: string | null }, source: "STOREFRONT" | "SELLER") {
  const assistantChatId = await ownAssistantChat(db, who, input.assistantChatId);
  if (who.type !== "GUEST") {
    const open = (await db.select({ id: liveChats.id }).from(liveChats).where(and(owned(who), inArray(liveChats.status, ["WAITING", "ACTIVE"]))).limit(1))[0];
    if (open) {
      await db.insert(liveChatMessages).values({ chatId: open.id, author: "REQUESTER", body: input.message });
      return { chatId: open.id, token: null as string | null, resumed: true };
    }
  } else if (!input.name) throw new AppError("VALIDATION_ERROR", "Add your name so our agent knows what to call you");
  const token = who.type === "GUEST" ? randomBytes(24).toString("base64url") : null;
  const [chat] = await db.insert(liveChats).values({
    source, requesterType: who.type, topic: input.topic, page: input.page || null,
    userId: who.type === "GUEST" ? null : who.userId,
    customerId: who.type === "CUSTOMER" ? who.customerId : null, sellerId: who.type === "SELLER" ? who.sellerId : null,
    guestName: who.type === "GUEST" ? input.name : null, guestContact: who.type === "GUEST" ? input.contact || null : null,
    guestTokenHash: token ? hashToken(token) : null, assistantChatId,
  }).returning({ id: liveChats.id });
  await db.insert(liveChatMessages).values({ chatId: chat!.id, author: "REQUESTER", body: input.message });
  await sweepLiveChats(db, true);
  return { chatId: chat!.id, token, resumed: false };
}

/** The requester's open chat, if any (to resume after a page change). */
export async function openLiveChatFor(db: Database, who: LiveRequester) {
  return (await db.select({ id: liveChats.id }).from(liveChats).where(and(owned(who), inArray(liveChats.status, ["WAITING", "ACTIVE"]))).orderBy(desc(liveChats.createdAt)).limit(1))[0]?.id ?? null;
}

async function ownChat(db: Database, who: LiveRequester, chatId: string) {
  const chat = (await db.select().from(liveChats).where(and(eq(liveChats.id, chatId), owned(who))).limit(1))[0];
  if (!chat) throw new AppError("NOT_FOUND", "Chat not found");
  return chat;
}

/** What the requester's chat window shows; also records that they're still here. */
export async function requesterLiveView(db: Database, who: LiveRequester, chatId: string, afterSeq: number) {
  await ownChat(db, who, chatId);
  if (afterSeq >= 0) await db.update(liveChats).set({ requesterSeenAt: new Date() }).where(and(eq(liveChats.id, chatId), inArray(liveChats.status, ["WAITING", "ACTIVE"])));
  // Back after a hold and they've seen it: an ordinary chat again (see the sweep).
  if (afterSeq >= 0) await db.update(liveChats).set({ holdReason: null, holdNote: null }).where(and(eq(liveChats.id, chatId), eq(liveChats.status, "ACTIVE"), isNull(liveChats.heldAt), isNotNull(liveChats.holdReason)));
  await sweepLiveChats(db);
  const chat = await ownChat(db, who, chatId);
  const messages = await db.select({ seq: liveChatMessages.seq, author: liveChatMessages.author, body: liveChatMessages.body, attachment: liveChatMessages.attachment, createdAt: liveChatMessages.createdAt, agentUserId: liveChatMessages.agentUserId })
    .from(liveChatMessages).where(and(eq(liveChatMessages.chatId, chatId), gt(liveChatMessages.seq, Math.max(0, afterSeq)))).orderBy(asc(liveChatMessages.seq)).limit(200);
  const lastSeq = messages.at(-1)?.seq ?? afterSeq;
  if (lastSeq > chat.requesterReadSeq) await db.update(liveChats).set({ requesterReadSeq: lastSeq }).where(eq(liveChats.id, chatId));
  const names = await agentNames(db, [...new Set([chat.assignedAgentId, ...messages.map((m) => m.agentUserId)].filter((x): x is string => Boolean(x)))]);
  let position: number | null = null;
  let waitSeconds: number | null = null;
  if (chat.status === "WAITING") {
    const [ahead] = await db.select({ n: sql<number>`count(*)::int` }).from(liveChats).where(and(eq(liveChats.status, "WAITING"), lt(liveChats.queuedAt, chat.queuedAt)));
    position = Number(ahead?.n ?? 0) + 1;
    const agents = (await availableAgents(db)).filter((a) => a.status === "ONLINE");
    waitSeconds = estimateLiveWait(position, agents.reduce((s, a) => s + Math.max(0, a.maxChats - a.active), 0), agents.length);
  }
  const waited = Math.round((Date.now() - chat.queuedAt.getTime()) / 1000);
  return {
    chat: {
      id: chat.id, status: chat.status, topic: chat.topic, endReason: chat.endReason, rating: chat.rating, ticketId: chat.ticketId,
      agentName: chat.assignedAgentId ? names.get(chat.assignedAgentId) ?? "Support" : null,
      agentTyping: chat.status === "ACTIVE" && !!chat.agentTypingAt && Date.now() - chat.agentTypingAt.getTime() < LIVE_CHAT_TIMING.typing * 1000,
      agentReadSeq: chat.agentReadSeq,
      onHold: chat.status === "ACTIVE" && !!chat.heldAt, holdLabel: chat.heldAt ? LIVE_HOLD_REASONS[chat.holdReason ?? "OTHER"] : null,
      position, waitSeconds, waited,
      // Waited too long, or nobody online: offer to leave a message instead.
      offerMessage: chat.status === "WAITING" && (waitSeconds === null || waited >= LIVE_CHAT_TIMING.offerMessageAfter),
    },
    messages: messages.map((m) => ({ seq: m.seq, author: m.author, body: m.body, attachment: m.attachment ?? null, createdAt: m.createdAt, agentName: m.agentUserId ? names.get(m.agentUserId) ?? "Support" : null })),
    lastSeq,
  };
}

/** Checks the requester can still send in this chat (e.g. before saving an uploaded file). */
export async function requesterCanSend(db: Database, who: LiveRequester, chatId: string) {
  const chat = await ownChat(db, who, chatId);
  if (chat.status === "ENDED") throw new AppError("CONFLICT", "This chat has ended. Start a new one if you need more help.");
}

/** A text message, or a photo/PDF with an optional caption. */
export async function requesterLiveSend(db: Database, who: LiveRequester, chatId: string, body: string, attachment?: LiveChatAttachment) {
  const chat = await ownChat(db, who, chatId);
  if (chat.status === "ENDED") throw new AppError("CONFLICT", "This chat has ended. Start a new one if you need more help.");
  await db.insert(liveChatMessages).values({ chatId, author: "REQUESTER", body, attachment: attachment ?? null });
  await db.update(liveChats).set({ requesterTypingAt: null, requesterSeenAt: new Date(), updatedAt: new Date() }).where(eq(liveChats.id, chatId));
}

export async function requesterLiveTyping(db: Database, who: LiveRequester, chatId: string) {
  await ownChat(db, who, chatId);
  await db.update(liveChats).set({ requesterTypingAt: new Date(), requesterSeenAt: new Date() }).where(and(eq(liveChats.id, chatId), inArray(liveChats.status, ["WAITING", "ACTIVE"])));
}

export async function requesterLiveEnd(db: Database, who: LiveRequester, chatId: string) {
  const chat = await ownChat(db, who, chatId);
  if (chat.status === "ENDED") return;
  await db.update(liveChats).set({ status: "ENDED", endedAt: new Date(), endedBy: "REQUESTER", endReason: chat.status === "ACTIVE" ? "RESOLVED" : "ABANDONED", updatedAt: new Date() }).where(eq(liveChats.id, chatId));
  await system(db, chatId, "Chat ended.");
}

export async function requesterLiveRate(db: Database, who: LiveRequester, chatId: string, rating: number, note?: string) {
  const chat = await ownChat(db, who, chatId);
  if (chat.status !== "ENDED") throw new AppError("CONFLICT", "You can rate the chat once it has ended");
  await db.update(liveChats).set({ rating, ratingNote: note || null, updatedAt: new Date() }).where(eq(liveChats.id, chatId));
}

/** Turns a chat into a support request (the team replies there), with the conversation attached. */
async function chatToTicket(db: Database, chat: typeof liveChats.$inferSelect, extra: string, byAgentId: string | null) {
  const lines = (await db.select({ author: liveChatMessages.author, body: liveChatMessages.body, attachment: liveChatMessages.attachment }).from(liveChatMessages).where(eq(liveChatMessages.chatId, chat.id)).orderBy(asc(liveChatMessages.seq)))
    .map((l) => ({ author: l.author, body: [l.body, l.attachment ? `[${l.attachment.kind === "IMAGE" ? "Photo" : "Document"}: ${l.attachment.name}]` : ""].filter(Boolean).join(" ") }));
  const name = await requesterName(db, chat);
  const firstAsk = lines.find((l) => l.author === "REQUESTER")?.body ?? "Live chat";
  const guestNote = chat.requesterType === "GUEST" ? `Guest: ${chat.guestName ?? "—"}${chat.guestContact ? ` · ${chat.guestContact}` : " · no contact given"}\n\n` : "";
  const [ticket] = await db.insert(supportTickets).values({
    requesterType: chat.requesterType === "SELLER" ? "SELLER" : "CUSTOMER", requesterUserId: chat.userId, customerId: chat.customerId, sellerId: chat.sellerId,
    category: chat.topic, priority: "HIGH", channel: "CHAT", subject: firstAsk.slice(0, 110), body: guestNote + (extra || firstAsk), assignedToUserId: byAgentId,
  }).returning();
  await db.insert(supportMessages).values({ ticketId: ticket!.id, senderUserId: chat.userId, authorType: "REQUESTER", message: guestNote + (extra || firstAsk) });
  const before = await assistantTranscript(db, chat.assistantChatId);
  if (before.length) await db.insert(supportMessages).values({ ticketId: ticket!.id, authorType: "SYSTEM", isInternal: true, message: `${name}'s chat with the assistant first:\n\n` + before.map((m) => `${m.role === "user" ? name : "Assistant"}: ${m.content}`).join("\n\n").slice(0, 12_000) });
  await db.insert(supportMessages).values({ ticketId: ticket!.id, authorType: "SYSTEM", isInternal: true, message: `Live chat with ${name} before this request:\n\n` + lines.map((l) => `${l.author === "REQUESTER" ? name : l.author === "AGENT" ? "Agent" : "System"}: ${l.body}`).join("\n\n").slice(0, 12_000) });
  await db.update(liveChats).set({ status: "ENDED", endedAt: new Date(), endedBy: byAgentId ? "AGENT" : "REQUESTER", endReason: "TICKET", ticketId: ticket!.id, updatedAt: new Date() }).where(eq(liveChats.id, chat.id));
  await system(db, chat.id, `We've saved this as support request #${ticket!.number}. Our team will reply ${chat.requesterType === "GUEST" ? (chat.guestContact ? `to ${chat.guestContact}` : "as soon as possible") : "in your support requests"}.`);
  return ticket!;
}

/** No one free in time: the requester leaves a message instead (it becomes a support request). */
export async function requesterLeaveMessage(db: Database, who: LiveRequester, chatId: string, message: string, contact?: string) {
  const chat = await ownChat(db, who, chatId);
  if (chat.status !== "WAITING") throw new AppError("CONFLICT", "An agent is already with you");
  if (who.type === "GUEST" && !contact && !chat.guestContact) throw new AppError("VALIDATION_ERROR", "Add a phone number or email so we can reply");
  if (contact && who.type === "GUEST") await db.update(liveChats).set({ guestContact: contact }).where(eq(liveChats.id, chatId));
  const fresh = (await db.select().from(liveChats).where(eq(liveChats.id, chatId)).limit(1))[0]!;
  return chatToTicket(db, fresh, message, null);
}

// ---------- agent console ----------

export async function setAgentPresence(db: Database, userId: string, status?: "ONLINE" | "AWAY" | "OFFLINE", maxChats?: number) {
  const values = { lastSeenAt: new Date(), ...(status ? { status } : {}), ...(maxChats ? { maxChats } : {}) };
  await db.insert(liveChatAgents).values({ userId, status: status ?? "OFFLINE", maxChats: maxChats ?? 3, lastSeenAt: new Date() })
    .onConflictDoUpdate({ target: liveChatAgents.userId, set: values });
  if (status) await sweepLiveChats(db, true);
}

const startOfIstDay = () => { const d = new Date(Date.now() + 330 * 60_000); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() - 330 * 60_000); };

/** Everything the agent console shows; also the agent's heartbeat. */
export async function agentConsole(db: Database, agentUserId: string) {
  await setAgentPresence(db, agentUserId);
  await sweepLiveChats(db);
  const me = (await db.select().from(liveChatAgents).where(eq(liveChatAgents.userId, agentUserId)).limit(1))[0]!;
  const open = await db.select().from(liveChats).where(inArray(liveChats.status, ["WAITING", "ACTIVE"])).orderBy(asc(liveChats.queuedAt));
  const ids = open.map((c) => c.id);
  const [lastMsgs, unread] = ids.length ? await Promise.all([
    db.execute<{ chat_id: string; author: string; body: string; created_at: string; seq: number }>(sql`select distinct on (chat_id) chat_id, author, coalesce(nullif(body, ''), case when attachment is not null then (case when attachment->>'kind' = 'IMAGE' then '📷 Photo' else '📄 ' || (attachment->>'name') end) else '' end) as body, created_at, seq from live_chat_messages where chat_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) and author <> 'SYSTEM' order by chat_id, seq desc`),
    db.execute<{ chat_id: string; n: number }>(sql`select m.chat_id, count(*)::int n from live_chat_messages m join live_chats c on c.id = m.chat_id where m.chat_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) and m.author = 'REQUESTER' and m.seq > c.agent_read_seq group by m.chat_id`),
  ]) : [{ rows: [] }, { rows: [] }];
  const last = new Map(lastMsgs.rows.map((r) => [r.chat_id, r]));
  const unreadBy = new Map(unread.rows.map((r) => [r.chat_id, Number(r.n)]));
  const agents = await availableAgents(db);
  const names = await agentNames(db, [...new Set(open.map((c) => c.assignedAgentId).filter((x): x is string => Boolean(x)))]);
  const now = Date.now();
  const row = async (c: (typeof open)[number]) => {
    const lm = last.get(c.id);
    return {
      id: c.id, status: c.status, topic: supportCategoryLabel(c.topic), source: c.source, requesterType: c.requesterType,
      name: await requesterName(db, c), agentId: c.assignedAgentId, agentName: c.assignedAgentId ? names.get(c.assignedAgentId) ?? null : null,
      waitedSeconds: Math.round((now - c.queuedAt.getTime()) / 1000),
      lastMessage: lm ? { author: lm.author, body: lm.body.slice(0, 120), at: lm.created_at } : null,
      // Seconds the requester has been waiting for our reply (their message is the latest one).
      awaitingReplySeconds: lm?.author === "REQUESTER" ? Math.round((now - new Date(lm.created_at).getTime()) / 1000) : 0,
      unread: unreadBy.get(c.id) ?? 0,
      requesterTyping: !!c.requesterTypingAt && now - c.requesterTypingAt.getTime() < LIVE_CHAT_TIMING.typing * 1000,
      requesterOnline: now - c.requesterSeenAt.getTime() < 30_000,
      hold: c.heldAt ? { since: c.heldAt, reason: c.holdReason ?? "OTHER", label: LIVE_HOLD_REASONS[c.holdReason ?? "OTHER"], note: c.holdNote } : null,
    };
  };
  const queue = await Promise.all(open.filter((c) => c.status === "WAITING").map(row));
  const mine = await Promise.all(open.filter((c) => c.status === "ACTIVE" && !c.heldAt && c.assignedAgentId === agentUserId).map(row));
  const others = await Promise.all(open.filter((c) => c.status === "ACTIVE" && !c.heldAt && c.assignedAgentId !== agentUserId).map(row));
  // Everyone's chats on hold (mine first): anyone can pick one up once the update arrives if its agent is away.
  const held = await Promise.all(open.filter((c) => c.status === "ACTIVE" && c.heldAt).sort((a, b) => Number(b.assignedAgentId === agentUserId) - Number(a.assignedAgentId === agentUserId) || a.heldAt!.getTime() - b.heldAt!.getTime()).map(row));

  // Today's numbers (India time).
  const since = startOfIstDay();
  const [stats] = (await db.execute<{ total: number; missed: number; avg_wait: number | null; avg_first: number | null; rating: number | null; rated: number }>(sql`
    select count(*)::int total,
      count(*) filter (where end_reason = 'ABANDONED' and accepted_at is null)::int missed,
      avg(extract(epoch from (accepted_at - created_at))) filter (where accepted_at is not null) avg_wait,
      avg(extract(epoch from (first_agent_reply_at - accepted_at))) filter (where first_agent_reply_at is not null) avg_first,
      avg(rating) rating, count(rating)::int rated
    from live_chats where created_at >= ${since.toISOString()}::timestamptz`)).rows;
  return {
    me: { status: me.status, maxChats: me.maxChats, active: mine.length },
    queue, mine, others, held,
    agents: agents.map((a) => ({ userId: a.userId, name: a.name, status: a.status, active: a.active, maxChats: a.maxChats })),
    today: {
      chats: Number(stats?.total ?? 0), missed: Number(stats?.missed ?? 0),
      avgWaitSeconds: stats?.avg_wait != null ? Math.round(Number(stats.avg_wait)) : null,
      avgFirstReplySeconds: stats?.avg_first != null ? Math.round(Number(stats.avg_first)) : null,
      rating: stats?.rating != null ? Math.round(Number(stats.rating) * 10) / 10 : null, rated: Number(stats?.rated ?? 0),
    },
  };
}

/** A chat for the agent: messages after a seq, and (first time) who they're talking to. */
export async function agentLiveChat(db: Database, agentUserId: string, chatId: string, afterSeq: number, withContext: boolean) {
  const chat = (await db.select().from(liveChats).where(eq(liveChats.id, chatId)).limit(1))[0];
  if (!chat) throw new AppError("NOT_FOUND", "Chat not found");
  const messages = await db.select({ seq: liveChatMessages.seq, author: liveChatMessages.author, body: liveChatMessages.body, attachment: liveChatMessages.attachment, createdAt: liveChatMessages.createdAt, agentUserId: liveChatMessages.agentUserId })
    .from(liveChatMessages).where(and(eq(liveChatMessages.chatId, chatId), gt(liveChatMessages.seq, Math.max(0, afterSeq)))).orderBy(asc(liveChatMessages.seq)).limit(300);
  const lastSeq = messages.at(-1)?.seq ?? afterSeq;
  if (chat.assignedAgentId === agentUserId && lastSeq > chat.agentReadSeq) await db.update(liveChats).set({ agentReadSeq: lastSeq }).where(eq(liveChats.id, chatId));
  const names = await agentNames(db, [...new Set([chat.assignedAgentId, ...messages.map((m) => m.agentUserId)].filter((x): x is string => Boolean(x)))]);
  let context: Record<string, unknown> | null = null;
  if (withContext) {
    const user = chat.userId ? (await db.select({ email: users.email, phone: users.phone }).from(users).where(eq(users.id, chat.userId)).limit(1))[0] : undefined;
    context = { name: await requesterName(db, chat), requesterType: chat.requesterType, email: user?.email ?? null, phone: user?.phone ?? null, guestContact: chat.guestContact, page: chat.page, customerId: chat.customerId, sellerId: chat.sellerId, topic: supportCategoryLabel(chat.topic), assistantChat: await assistantTranscript(db, chat.assistantChatId) };
  }
  return {
    chat: {
      id: chat.id, status: chat.status, assignedAgentId: chat.assignedAgentId, agentName: chat.assignedAgentId ? names.get(chat.assignedAgentId) ?? null : null,
      requesterTyping: !!chat.requesterTypingAt && Date.now() - chat.requesterTypingAt.getTime() < LIVE_CHAT_TIMING.typing * 1000,
      requesterReadSeq: chat.requesterReadSeq, requesterOnline: Date.now() - chat.requesterSeenAt.getTime() < 30_000,
      hold: chat.status === "ACTIVE" && chat.heldAt ? { since: chat.heldAt, reason: chat.holdReason ?? "OTHER", label: LIVE_HOLD_REASONS[chat.holdReason ?? "OTHER"], note: chat.holdNote } : null,
      createdAt: chat.createdAt, acceptedAt: chat.acceptedAt, endedAt: chat.endedAt, endReason: chat.endReason, rating: chat.rating, ratingNote: chat.ratingNote, ticketId: chat.ticketId,
    },
    messages: messages.map((m) => ({ seq: m.seq, author: m.author, body: m.body, attachment: m.attachment ?? null, createdAt: m.createdAt, agentName: m.agentUserId ? names.get(m.agentUserId) ?? "Support" : null })),
    lastSeq, context,
  };
}

async function assignedChat(db: Database, agentUserId: string, chatId: string) {
  const chat = (await db.select().from(liveChats).where(eq(liveChats.id, chatId)).limit(1))[0];
  if (!chat) throw new AppError("NOT_FOUND", "Chat not found");
  if (chat.status !== "ACTIVE" || chat.assignedAgentId !== agentUserId) throw new AppError("CONFLICT", "This chat isn't assigned to you");
  return chat;
}

/** Checks the agent can reply in this chat (e.g. before saving an uploaded file). */
export async function agentCanSend(db: Database, agentUserId: string, chatId: string) {
  await assignedChat(db, agentUserId, chatId);
}

/** A reply, or a photo/PDF with an optional caption. */
export async function agentLiveSend(db: Database, agentUserId: string, chatId: string, body: string, attachment?: LiveChatAttachment) {
  const chat = await assignedChat(db, agentUserId, chatId);
  const [msg] = await db.insert(liveChatMessages).values({ chatId, author: "AGENT", agentUserId, body, attachment: attachment ?? null }).returning({ seq: liveChatMessages.seq });
  await db.update(liveChats).set({ agentTypingAt: null, agentReadSeq: msg!.seq, firstAgentReplyAt: chat.firstAgentReplyAt ?? new Date(), updatedAt: new Date() }).where(eq(liveChats.id, chatId));
}

export async function agentLiveTyping(db: Database, agentUserId: string, chatId: string) {
  await db.update(liveChats).set({ agentTypingAt: new Date() }).where(and(eq(liveChats.id, chatId), eq(liveChats.assignedAgentId, agentUserId), eq(liveChats.status, "ACTIVE")));
}

/** Pick up a waiting chat yourself. */
export async function agentLiveTake(db: Database, agentUserId: string, chatId: string) {
  const taken = await db.update(liveChats).set({ status: "ACTIVE", assignedAgentId: agentUserId, acceptedAt: sql`coalesce(${liveChats.acceptedAt}, now())`, updatedAt: new Date() })
    .where(and(eq(liveChats.id, chatId), eq(liveChats.status, "WAITING"))).returning({ id: liveChats.id });
  if (!taken.length) throw new AppError("CONFLICT", "Someone else already took this chat");
  await system(db, chatId, `${(await agentNames(db, [agentUserId])).get(agentUserId)} joined the chat`);
}

export async function agentLiveTransfer(db: Database, agentUserId: string, chatId: string, toAgentId: string) {
  await assignedChat(db, agentUserId, chatId);
  const target = (await availableAgents(db)).find((a) => a.userId === toAgentId);
  if (!target) throw new AppError("VALIDATION_ERROR", "That agent isn't online for live chat");
  await db.update(liveChats).set({ assignedAgentId: toAgentId, agentReadSeq: 0, updatedAt: new Date() }).where(eq(liveChats.id, chatId));
  await system(db, chatId, `${target.name} has joined to help you.`);
}

/** Park the chat while waiting on the seller, courier or team; it stays open for the requester. */
export async function agentLiveHold(db: Database, agentUserId: string, chatId: string, reason: keyof typeof LIVE_HOLD_REASONS, note: string) {
  const chat = await assignedChat(db, agentUserId, chatId);
  if (chat.heldAt) throw new AppError("CONFLICT", "This chat is already on hold");
  await db.update(liveChats).set({ heldAt: new Date(), holdReason: reason, holdNote: note || null, agentTypingAt: null, updatedAt: new Date() }).where(eq(liveChats.id, chatId));
  await system(db, chatId, `Your chat is on hold: ${LIVE_HOLD_REASONS[reason].toLowerCase()}.`);
}

/**
 * Back from hold. The assigned agent, or anyone when that agent isn't
 * around (they take it over), as long as they have room.
 */
export async function agentLiveResume(db: Database, agentUserId: string, chatId: string) {
  const chat = (await db.select().from(liveChats).where(eq(liveChats.id, chatId)).limit(1))[0];
  if (!chat) throw new AppError("NOT_FOUND", "Chat not found");
  if (chat.status !== "ACTIVE" || !chat.heldAt) throw new AppError("CONFLICT", "This chat isn't on hold");
  if (chat.assignedAgentId !== agentUserId) {
    const present = (await availableAgents(db)).some((a) => a.userId === chat.assignedAgentId && a.status !== "OFFLINE");
    if (present) throw new AppError("CONFLICT", `${(await agentNames(db, [chat.assignedAgentId!])).get(chat.assignedAgentId!)} is online and will pick this up`);
  }
  // A short grace period for the requester to come back before the idle check applies.
  const resumed = await db.update(liveChats).set({ heldAt: null, assignedAgentId: agentUserId, requesterSeenAt: new Date(), updatedAt: new Date() })
    .where(and(eq(liveChats.id, chatId), isNotNull(liveChats.heldAt))).returning({ id: liveChats.id });
  if (!resumed.length) throw new AppError("CONFLICT", "Someone else already picked this up");
  await system(db, chatId, `${(await agentNames(db, [agentUserId])).get(agentUserId)} is back with you.`);
}

export async function agentLiveEnd(db: Database, agentUserId: string, chatId: string) {
  await assignedChat(db, agentUserId, chatId);
  await db.update(liveChats).set({ status: "ENDED", endedAt: new Date(), endedBy: "AGENT", endReason: "RESOLVED", updatedAt: new Date() }).where(eq(liveChats.id, chatId));
  await system(db, chatId, "The agent ended the chat. Thanks for chatting with LOIMART!");
}

export async function agentLiveToTicket(db: Database, agentUserId: string, chatId: string, note: string) {
  const chat = await assignedChat(db, agentUserId, chatId);
  return chatToTicket(db, chat, note, agentUserId);
}

/** Ended chats for the console's history tab. */
export async function liveChatHistory(db: Database, q: string) {
  const rows = await db.select().from(liveChats).where(eq(liveChats.status, "ENDED")).orderBy(desc(liveChats.endedAt)).limit(100);
  const names = await agentNames(db, [...new Set(rows.map((r) => r.assignedAgentId).filter((x): x is string => Boolean(x)))]);
  const items = await Promise.all(rows.map(async (r) => ({
    id: r.id, name: await requesterName(db, r), requesterType: r.requesterType, topic: supportCategoryLabel(r.topic), agentName: r.assignedAgentId ? names.get(r.assignedAgentId) ?? null : null,
    createdAt: r.createdAt, endedAt: r.endedAt, endReason: r.endReason, rating: r.rating, ticketId: r.ticketId,
    waitSeconds: r.acceptedAt ? Math.round((r.acceptedAt.getTime() - r.createdAt.getTime()) / 1000) : null,
  })));
  const needle = q.trim().toLowerCase();
  return needle ? items.filter((i) => `${i.name} ${i.topic} ${i.agentName ?? ""}`.toLowerCase().includes(needle)) : items;
}

