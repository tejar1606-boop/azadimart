import { enforceRateLimit, getSessionPrincipal } from "@azadimart/auth";
import {
  createDatabase, liveChatAvailability, openLiveChatFor, requesterLeaveMessage, requesterLiveEnd, requesterLiveRate, requesterLiveSend,
  requesterLiveTyping, requesterLiveView, startLiveChat, type LiveRequester,
} from "@azadimart/database";
import { AppError, liveChatMessageSchema, liveChatRateSchema, liveChatStartSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ path?: string[] }> };
const SOURCE = "STOREFRONT" as const;

/** Signed-in shoppers chat as themselves; guests use the chat key they were given (x-live-chat-key). */
async function requester(request: Request, db: ReturnType<typeof createDatabase>): Promise<LiveRequester> {
  const p = await getSessionPrincipal(request, db);
  if (p?.role === "CUSTOMER" && p.customerId) return { type: "CUSTOMER", userId: p.userId, customerId: p.customerId };
  return { type: "GUEST", token: request.headers.get("x-live-chat-key") };
}

const fail = (error: unknown) => { const { status, body } = toApiError(error, crypto.randomUUID()); return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } }); };
const ok = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/** GET /live-chat → who's online and the expected wait (+ your open chat). GET /live-chat/{id}?after=N → new messages. */
export async function GET(request: Request, { params }: Params) {
  try {
    const db = createDatabase();
    const [chatId] = (await params).path ?? [];
    const who = await requester(request, db);
    if (!chatId) return ok({ ...(await liveChatAvailability(db)), openChatId: await openLiveChatFor(db, who), signedIn: who.type !== "GUEST" });
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
    return ok(await requesterLiveView(db, who, uuidSchema.parse(chatId), after));
  } catch (error) { return fail(error); }
}

/** POST /live-chat (start) · /{id}/messages · /{id}/typing · /{id}/end · /{id}/rate · /{id}/leave-message */
export async function POST(request: Request, { params }: Params) {
  try {
    const db = createDatabase();
    const [chatId, action] = (await params).path ?? [];
    const who = await requester(request, db);
    const json = async () => request.json().catch(() => ({}));
    if (!chatId) {
      await enforceRateLimit(db, request, "liveChatStart", who.type === "GUEST" ? {} : { subject: who.userId });
      const input = liveChatStartSchema.parse(await json());
      return ok(await startLiveChat(db, who, input, SOURCE), 201);
    }
    const id = uuidSchema.parse(chatId);
    if (action === "messages") {
      await enforceRateLimit(db, request, "liveChatMessage", who.type === "GUEST" ? { subject: "chat:" + id } : { subject: who.userId });
      await requesterLiveSend(db, who, id, liveChatMessageSchema.parse(await json()).body);
      return ok(await requesterLiveView(db, who, id, Number(new URL(request.url).searchParams.get("after") ?? 0) || 0), 201);
    }
    if (action === "typing") { await requesterLiveTyping(db, who, id); return ok({ ok: true }); }
    if (action === "end") { await requesterLiveEnd(db, who, id); return ok({ ok: true }); }
    if (action === "rate") { const r = liveChatRateSchema.parse(await json()); await requesterLiveRate(db, who, id, r.rating, r.note); return ok({ ok: true }); }
    if (action === "leave-message") {
      const body = (await json()) as { message?: unknown; contact?: unknown };
      const message = liveChatMessageSchema.parse({ body: body.message }).body;
      const ticket = await requesterLeaveMessage(db, who, id, message, typeof body.contact === "string" ? body.contact.trim().slice(0, 120) : undefined);
      return ok({ ticket: { id: ticket.id, number: ticket.number } }, 201);
    }
    throw new AppError("NOT_FOUND", "Unknown live chat action");
  } catch (error) { return fail(error); }
}
