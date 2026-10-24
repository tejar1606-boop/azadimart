import { enforceRateLimit, getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, saveSupportChat } from "@azadimart/database";
import { answerSupport } from "@azadimart/notify/support-bot";
import { supportChatSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { customerBot } from "../../../../lib/support-bot";

export const dynamic = "force-dynamic";

/** One turn of the help chat. Works for guests too (order answers need sign-in). */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    const principal = await getSessionPrincipal(request, db);
    const customer = principal?.role === "CUSTOMER" && principal.customerId ? principal : null;
    await enforceRateLimit(db, request, "supportChat", customer ? { subject: customer.userId } : {});
    const input = supportChatSchema.parse(await request.json());
    const { reply, engine } = await answerSupport(customerBot(request, { customerId: customer?.customerId ?? null }), input);
    // The visible words of this turn are kept so the team can see them if a ticket follows.
    const said = input.message || input.intent.replace(/_/g, " ");
    const chatId = await saveSupportChat(db, {
      chatId: input.chatId, requesterType: "CUSTOMER", userId: customer?.userId ?? null, customerId: customer?.customerId ?? null,
      turn: [{ role: "user", content: said }, { role: "assistant", content: reply.text }], engine,
    }).catch(() => input.chatId);
    return NextResponse.json({ chatId, reply, engine, signedIn: Boolean(customer) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
