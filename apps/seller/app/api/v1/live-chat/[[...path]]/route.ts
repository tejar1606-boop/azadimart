import { enforceRateLimit, getSessionPrincipal } from "@azadimart/auth";
import {
  createDatabase, liveChatAvailability, openLiveChatFor, requesterCanSend, requesterLeaveMessage, requesterLiveEnd, requesterLiveRate, requesterLiveSend,
  requesterLiveTyping, requesterLiveView, startLiveChat, type LiveRequester,
} from "@azadimart/database";
import { AppError, LIVE_CHAT_FILE_MAX_BYTES, liveChatMessageSchema, liveChatRateSchema, liveChatStartSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { ChatFileError, assertUploadsAvailable, getObjectStore, saveChatUpload, serveChatFile, withChatFileLinks } from "@azadimart/storage";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ path?: string[] }> };
const SOURCE = "SELLER" as const;

/** Sellers chat as their store (sign-in required). */
async function requester(request: Request, db: ReturnType<typeof createDatabase>): Promise<LiveRequester> {
  const p = await getSessionPrincipal(request, db);
  if (p?.role === "SELLER" && p.sellerId) return { type: "SELLER", userId: p.userId, sellerId: p.sellerId };
  throw new AppError("UNAUTHORIZED", "Please sign in to chat with seller support");
}

const fail = (error: unknown) => { const { status, body } = toApiError(error, crypto.randomUUID()); return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } }); };
/** Chat photos/PDFs open through signed links on this path. */
const FILES = "/api/v1/live-chat/files";
const ok = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/** GET /live-chat → who's online and the expected wait (+ your open chat). GET /live-chat/{id}?after=N → new messages. */
export async function GET(request: Request, { params }: Params) {
  try {
    const [chatId] = (await params).path ?? [];
    // GET /live-chat/files?k&e&s → a chat photo/PDF (the signed link is the permission).
    if (chatId === "files") return await serveChatFile(getObjectStore(), new URL(request.url).searchParams);
    const db = createDatabase();
    const who = await requester(request, db);
    if (!chatId) return ok({ ...(await liveChatAvailability(db)), openChatId: await openLiveChatFor(db, who), signedIn: who.type !== "GUEST" });
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
    return ok(withChatFileLinks(await requesterLiveView(db, who, uuidSchema.parse(chatId), after), FILES));
  } catch (error) { return fail(error); }
}

/** POST /live-chat (start) · /{id}/messages · /{id}/attachments · /{id}/typing · /{id}/end · /{id}/rate · /{id}/leave-message */
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
      return ok(withChatFileLinks(await requesterLiveView(db, who, id, Number(new URL(request.url).searchParams.get("after") ?? 0) || 0), FILES), 201);
    }
    if (action === "attachments") {
      // A photo or PDF (multipart "file", optional "caption"), stored privately.
      await enforceRateLimit(db, request, "upload", who.type === "GUEST" ? { subject: "chat:" + id } : { subject: who.userId });
      await requesterCanSend(db, who, id);
      try { assertUploadsAvailable(); } catch { throw new AppError("UNPROCESSABLE", "Sending files isn't available right now. Please describe the issue in a message."); }
      const { file, caption } = await saveChatUpload(getObjectStore(), request, id, LIVE_CHAT_FILE_MAX_BYTES)
        .catch((e) => { throw e instanceof ChatFileError ? new AppError("VALIDATION_ERROR", e.message) : e; });
      await requesterLiveSend(db, who, id, caption, file);
      return ok(withChatFileLinks(await requesterLiveView(db, who, id, Number(new URL(request.url).searchParams.get("after") ?? 0) || 0), FILES), 201);
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
