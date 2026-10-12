import { requireStaff } from "@azadimart/auth";
import {
  agentConsole, agentLiveChat, agentLiveEnd, agentLiveSend, agentLiveTake, agentLiveToTicket, agentLiveTransfer, agentLiveTyping,
  auditLogs, createDatabase, liveChatHistory, orders, products, sellers, setAgentPresence, supportCannedReplies,
} from "@azadimart/database";
import { AppError, liveAgentPresenceSchema, liveChatMessageSchema, liveChatTransferSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ path?: string[] }> };
const fail = (error: unknown) => { const { status, body } = toApiError(error, crypto.randomUUID()); return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } }); };
const ok = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Live chat console (team members whose role includes Live chat).
 * GET  /live-chat                      console state; also the agent's heartbeat
 * GET  /live-chat/history?q=           ended chats
 * GET  /live-chat/chats/{id}?after=N[&context=1]
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const db = createDatabase();
    const me = await requireStaff(request, "livechat", db);
    const [section, chatId] = (await params).path ?? [];
    const url = new URL(request.url);
    if (!section) return ok(await agentConsole(db, me.userId));
    if (section === "history") return ok({ items: await liveChatHistory(db, url.searchParams.get("q") ?? "") });
    if (section === "chats" && chatId) {
      const withContext = url.searchParams.get("context") === "1";
      const data = await agentLiveChat(db, me.userId, uuidSchema.parse(chatId), Number(url.searchParams.get("after") ?? 0) || 0, withContext);
      if (withContext && data.context) {
        const ctx = data.context as { customerId: string | null; sellerId: string | null };
        if (ctx.customerId) {
          (data.context as Record<string, unknown>).recentOrders = await db.select({ id: orders.id, number: orders.orderNumber, status: orders.status, total: orders.grandTotalPaise, createdAt: orders.createdAt })
            .from(orders).where(eq(orders.customerId, ctx.customerId)).orderBy(desc(orders.createdAt)).limit(5);
        }
        if (ctx.sellerId) {
          const [s] = await db.select({ storeName: sellers.storeName, status: sellers.status, holdReason: sellers.payoutHoldReason }).from(sellers).where(eq(sellers.id, ctx.sellerId)).limit(1);
          const [live] = await db.select({ n: count() }).from(products).where(and(eq(products.sellerId, ctx.sellerId), eq(products.status, "LIVE")));
          (data.context as Record<string, unknown>).seller = { ...s, liveProducts: Number(live?.n ?? 0) };
        }
        (data.context as Record<string, unknown>).canned = await db.select({ id: supportCannedReplies.id, title: supportCannedReplies.title, body: supportCannedReplies.body }).from(supportCannedReplies).orderBy(supportCannedReplies.title);
      }
      return ok(data);
    }
    throw new AppError("NOT_FOUND", "Unknown live chat path");
  } catch (error) { return fail(error); }
}

/**
 * POST /live-chat/presence {status, maxChats?}
 * POST /live-chat/chats/{id}/messages|typing|take|transfer|end|ticket
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const db = createDatabase();
    const me = await requireStaff(request, "livechat", db);
    const [section, chatId, action] = (await params).path ?? [];
    const json = async () => request.json().catch(() => ({}));
    if (section === "presence") {
      const input = liveAgentPresenceSchema.parse(await json());
      await setAgentPresence(db, me.userId, input.status, input.maxChats);
      return ok(await agentConsole(db, me.userId));
    }
    if (section !== "chats" || !chatId) throw new AppError("NOT_FOUND", "Unknown live chat path");
    const id = uuidSchema.parse(chatId);
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
    if (action === "messages") { await agentLiveSend(db, me.userId, id, liveChatMessageSchema.parse(await json()).body); return ok(await agentLiveChat(db, me.userId, id, after, false), 201); }
    if (action === "typing") { await agentLiveTyping(db, me.userId, id); return ok({ ok: true }); }
    if (action === "take") { await agentLiveTake(db, me.userId, id); await db.insert(auditLogs).values({ actorUserId: me.userId, action: "LIVE_CHAT_TAKEN", entityType: "live_chat", entityId: id, metadata: {} }); return ok({ ok: true }); }
    if (action === "transfer") { const { agentUserId } = liveChatTransferSchema.parse(await json()); await agentLiveTransfer(db, me.userId, id, agentUserId); await db.insert(auditLogs).values({ actorUserId: me.userId, action: "LIVE_CHAT_TRANSFERRED", entityType: "live_chat", entityId: id, metadata: { to: agentUserId } }); return ok({ ok: true }); }
    if (action === "end") { await agentLiveEnd(db, me.userId, id); return ok({ ok: true }); }
    if (action === "ticket") {
      const body = (await json()) as { note?: unknown };
      const ticket = await agentLiveToTicket(db, me.userId, id, typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "");
      await db.insert(auditLogs).values({ actorUserId: me.userId, action: "LIVE_CHAT_TO_TICKET", entityType: "live_chat", entityId: id, metadata: { ticket: ticket.number } });
      return ok({ ticket: { id: ticket.id, number: ticket.number } }, 201);
    }
    throw new AppError("NOT_FOUND", "Unknown live chat action");
  } catch (error) { return fail(error); }
}
