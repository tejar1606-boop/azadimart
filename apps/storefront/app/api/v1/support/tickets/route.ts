import { enforceRateLimit } from "@azadimart/auth";
import { createDatabase, createSupportTicket, listRequesterTickets } from "@azadimart/database";
import { supportTicketCreateSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { requireCustomerRequester } from "../requester";

export const dynamic = "force-dynamic";

/** The customer's support tickets. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const who = await requireCustomerRequester(request);
    return NextResponse.json({ items: await listRequesterTickets(createDatabase(), who) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Opens a ticket (from the help chat's "Talk to a person", or the support form). */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const who = await requireCustomerRequester(request);
    const db = createDatabase();
    await enforceRateLimit(db, request, "supportTicket", { subject: who.userId });
    const input = supportTicketCreateSchema.parse(await request.json());
    const ticket = await createSupportTicket(db, who, input, "FORM");
    return NextResponse.json({ ticket: { id: ticket.id, number: ticket.number, status: ticket.status } }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
