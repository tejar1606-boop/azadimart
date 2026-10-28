import { requireStaff } from "@azadimart/auth";
import {
  agentCanSend, agentConsole, agentLiveChat, agentLiveEnd, agentLiveHold, agentLiveResume, agentLiveSend, agentLiveTake, agentLiveToTicket, agentLiveTransfer, agentLiveTyping,
  auditLogs, createDatabase, liveChatAgents, liveChatHistory, liveChats, liveChatReport, liveChatReportCsv, liveChatReportRows, orders, products, sellers, setAgentPresence, supportCannedReplies,
} from "@azadimart/database";
import { AppError, LIVE_CHAT_FILE_MAX_BYTES, liveAgentPresenceSchema, liveChatHoldSchema, liveChatReportQuerySchema, liveChatMessageSchema, liveChatTransferSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { ChatFileError, assertUploadsAvailable, getObjectStore, saveChatUpload, serveChatFile, withChatFileLinks } from "@azadimart/storage";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ path?: string[] }> };
const fail = (error: unknown) => { const { status, body } = toApiError(error, crypto.randomUUID()); return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } }); };
/** Chat photos/PDFs open through signed links on this path. */
const FILES = "/api/v1/live-chat/files";
const ok = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** Report filters from the query string: India-time days, last 30 days by default, at most a year. */
function reportFilter(url: URL) {
  const q = liveChatReportQuerySchema.parse(Object.fromEntries([...url.searchParams].filter(([, v]) => v !== "")));
  const to = q.to ?? istToday();
  const from = q.from ?? new Date(new Date(to + "T00:00:00Z").getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  if (from > to) throw new AppError("VALIDATION_ERROR", "The start date is after the end date");
  if ((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 > 366) throw new AppError("VALIDATION_ERROR", "Choose a range of up to one year");
  return { from, to, agentId: q.agent, source: q.source, rating: q.rating, outcome: q.outcome };
}

/**
 * Live chat console (team members whose role includes Live chat).
 * GET  /live-chat                      console state; also the agent's heartbeat
 * GET  /live-chat/history?q=           ended chats
 * GET  /live-chat/report?from&to&agent&source&rating&outcome[&format=csv]   tracking + download
 * GET  /live-chat/chats/{id}?after=N[&context=1]
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const db = createDatabase();
    const me = await requireStaff(request, "livechat", db);
    const [section, chatId] = (await params).path ?? [];
    const url = new URL(request.url);
    if (section === "files") return await serveChatFile(getObjectStore(), url.searchParams);
    if (!section) return ok(await agentConsole(db, me.userId));
    if (section === "history") return ok({ items: await liveChatHistory(db, url.searchParams.get("q") ?? "") });
    if (section === "report") {
      const filter = reportFilter(url);
      if (url.searchParams.get("format") === "csv") {
        const rows = await liveChatReportRows(db, filter, 20_000);
        await db.insert(auditLogs).values({ actorUserId: me.userId, action: "LIVE_CHAT_REPORT_EXPORTED", entityType: "live_chat", entityId: null, metadata: { ...filter, rows: rows.length } });
        return new NextResponse(liveChatReportCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="loimart-live-chats-${filter.from}-to-${filter.to}.csv"`, "cache-control": "no-store" } });
      }
      const [report, rows] = await Promise.all([liveChatReport(db, filter), liveChatReportRows(db, filter, 200)]);
      return ok({ filter, ...report, rows });
    }
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
      return ok(withChatFileLinks(data, FILES));
    }
    throw new AppError("NOT_FOUND", "Unknown live chat path");
  } catch (error) { return fail(error); }
}

/**
 * POST /live-chat/presence {status, maxChats?}
 * POST /live-chat/heartbeat            keeps an Online agent online on any Admin page; returns their status and open chats
 * POST /live-chat/chats/{id}/messages|attachments|typing|take|transfer|end|ticket
 * POST /live-chat/chats/{id}/hold {reason, note?}   park while waiting on the seller/courier/team
 * POST /live-chat/chats/{id}/resume               back from hold (or take over one whose agent is away)
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
    if (section === "heartbeat") {
      await setAgentPresence(db, me.userId);
      const [agent] = await db.select({ status: liveChatAgents.status }).from(liveChatAgents).where(eq(liveChatAgents.userId, me.userId)).limit(1);
      const [mine] = await db.select({ n: count() }).from(liveChats).where(and(eq(liveChats.status, "ACTIVE"), isNull(liveChats.heldAt), eq(liveChats.assignedAgentId, me.userId)));
      return ok({ status: agent?.status ?? "OFFLINE", activeChats: Number(mine?.n ?? 0) });
    }
    if (section !== "chats" || !chatId) throw new AppError("NOT_FOUND", "Unknown live chat path");
    const id = uuidSchema.parse(chatId);
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
    if (action === "messages") { await agentLiveSend(db, me.userId, id, liveChatMessageSchema.parse(await json()).body); return ok(withChatFileLinks(await agentLiveChat(db, me.userId, id, after, false), FILES), 201); }
    if (action === "attachments") {
      // A photo or PDF for the shopper/seller (multipart "file", optional "caption").
      await agentCanSend(db, me.userId, id);
      try { assertUploadsAvailable(); } catch { throw new AppError("UNPROCESSABLE", "File uploads are unavailable: object storage is not configured."); }
      const { file, caption } = await saveChatUpload(getObjectStore(), request, id, LIVE_CHAT_FILE_MAX_BYTES)
        .catch((e) => { throw e instanceof ChatFileError ? new AppError("VALIDATION_ERROR", e.message) : e; });
      await agentLiveSend(db, me.userId, id, caption, file);
      return ok(withChatFileLinks(await agentLiveChat(db, me.userId, id, after, false), FILES), 201);
    }
    if (action === "typing") { await agentLiveTyping(db, me.userId, id); return ok({ ok: true }); }
    if (action === "take") { await agentLiveTake(db, me.userId, id); await db.insert(auditLogs).values({ actorUserId: me.userId, action: "LIVE_CHAT_TAKEN", entityType: "live_chat", entityId: id, metadata: {} }); return ok({ ok: true }); }
    if (action === "transfer") { const { agentUserId } = liveChatTransferSchema.parse(await json()); await agentLiveTransfer(db, me.userId, id, agentUserId); await db.insert(auditLogs).values({ actorUserId: me.userId, action: "LIVE_CHAT_TRANSFERRED", entityType: "live_chat", entityId: id, metadata: { to: agentUserId } }); return ok({ ok: true }); }
    if (action === "hold") {
      const { reason, note } = liveChatHoldSchema.parse(await json());
      await agentLiveHold(db, me.userId, id, reason, note);
      await db.insert(auditLogs).values({ actorUserId: me.userId, action: "LIVE_CHAT_HELD", entityType: "live_chat", entityId: id, metadata: { reason } });
      return ok({ ok: true });
    }
    if (action === "resume") { await agentLiveResume(db, me.userId, id); await db.insert(auditLogs).values({ actorUserId: me.userId, action: "LIVE_CHAT_RESUMED", entityType: "live_chat", entityId: id, metadata: {} }); return ok({ ok: true }); }
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
