import { enforceRateLimit } from "@azadimart/auth";
import { addRequesterMessage, createDatabase, getRequesterTicket, updateRequesterTicket } from "@azadimart/database";
import { supportReplySchema, supportRequesterUpdateSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { requireSellerRequester } from "../../requester";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ ticketId: string }> };

/** One ticket with the conversation (opening it marks replies as read). */
export async function GET(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const who = await requireSellerRequester(request);
    const ticketId = uuidSchema.parse((await params).ticketId);
    return NextResponse.json(await getRequesterTicket(createDatabase(), who, ticketId));
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** The seller replies. */
export async function POST(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const who = await requireSellerRequester(request);
    const ticketId = uuidSchema.parse((await params).ticketId);
    const db = createDatabase();
    await enforceRateLimit(db, request, "supportReply", { subject: who.userId });
    const { message } = supportReplySchema.parse(await request.json());
    await addRequesterMessage(db, who, ticketId, message);
    return NextResponse.json(await getRequesterTicket(db, who, ticketId), { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Mark solved and/or rate the help. */
export async function PATCH(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const who = await requireSellerRequester(request);
    const ticketId = uuidSchema.parse((await params).ticketId);
    const db = createDatabase();
    await updateRequesterTicket(db, who, ticketId, supportRequesterUpdateSchema.parse(await request.json()));
    return NextResponse.json(await getRequesterTicket(db, who, ticketId));
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
