import { enforceRateLimit } from "@azadimart/auth";
import { createDatabase, saveSupportChat } from "@azadimart/database";
import { answerSupport } from "@azadimart/notify/support-bot";
import { supportChatSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { sellerBot } from "../../../../lib/support-bot";
import { requireSellerRequester } from "../requester";

export const dynamic = "force-dynamic";

/** One turn of the seller help chat, answered from the seller's own data. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const who = await requireSellerRequester(request);
    const db = createDatabase();
    await enforceRateLimit(db, request, "supportChat", { subject: who.userId });
    const input = supportChatSchema.parse(await request.json());
    const { reply, engine } = await answerSupport(sellerBot(who.sellerId), input);
    const said = input.message || input.intent.replace(/_/g, " ");
    const chatId = await saveSupportChat(db, {
      chatId: input.chatId, requesterType: "SELLER", userId: who.userId, sellerId: who.sellerId,
      turn: [{ role: "user", content: said }, { role: "assistant", content: reply.text }], engine,
    }).catch(() => input.chatId);
    return NextResponse.json({ chatId, reply, engine, signedIn: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
