import { requireStaff } from "@azadimart/auth";
import { callAgents, calls, createDatabase, customers, sellers, startOutboundCall, users } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { statusCallbackUrl, telephony } from "../../../lib/telephony";

/** Call history: ?view=recent (default) or missed (waiting for a callback); ?q= number or name. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "support");
    const url = new URL(request.url);
    const view = url.searchParams.get("view") === "missed" ? "missed" : "recent";
    const q = url.searchParams.get("q")?.trim().slice(0, 60) ?? "";
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const items = await createDatabase().select({
      id: calls.id, direction: calls.direction, status: calls.status, customerPhone: calls.customerPhone, ivrChoice: calls.ivrChoice, createdAt: calls.createdAt, answeredAt: calls.answeredAt,
      durationSeconds: calls.durationSeconds, waitSeconds: calls.waitSeconds, outcome: calls.outcome, notes: calls.notes, recordingUrl: calls.recordingUrl, orderId: calls.orderId, ticketId: calls.ticketId,
      callbackDoneAt: calls.callbackDoneAt, agentEmail: users.email, customerName: customers.fullName, sellerName: sellers.storeName,
    }).from(calls).leftJoin(users, eq(users.id, calls.agentUserId)).leftJoin(customers, eq(customers.id, calls.customerId)).leftJoin(sellers, eq(sellers.id, calls.sellerId))
      .where(and(view === "missed" ? and(eq(calls.status, "MISSED"), isNull(calls.callbackDoneAt)) : undefined, q ? or(ilike(calls.customerPhone, like), ilike(customers.fullName, like), ilike(sellers.storeName, like)) : undefined))
      .orderBy(desc(calls.createdAt)).limit(200);
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

const dialSchema = z.object({ phone: z.string().trim().min(10).max(16), orderId: uuidSchema.nullable().optional(), ticketId: uuidSchema.nullable().optional() });
/** Dial a customer or seller from the agent's softphone. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "support");
    const input = dialSchema.parse(await request.json());
    const line = telephony();
    if (!line) throw new AppError("UNPROCESSABLE", "Calling isn't set up yet: connect LOIMART's phone provider (Exotel) first.");
    const db = createDatabase();
    const call = await startOutboundCall(db, { userId: principal.userId, phone: input.phone, provider: line.name, businessNumber: line.businessNumber, orderId: input.orderId, ticketId: input.ticketId });
    const agent = (await db.select({ id: callAgents.providerAgentId }).from(callAgents).where(eq(callAgents.userId, principal.userId)).limit(1))[0];
    try {
      const placed = await line.placeCall({ agentId: agent?.id ?? null, to: call.customerPhone, callId: call.id, statusCallbackUrl: statusCallbackUrl(request) });
      await db.update(calls).set({ providerCallId: placed.providerCallId }).where(eq(calls.id, call.id));
    } catch (error) {
      await db.update(calls).set({ status: "FAILED", endedAt: new Date(), notes: error instanceof Error ? error.message : "Call failed" }).where(eq(calls.id, call.id));
      throw new AppError("UNPROCESSABLE", error instanceof Error ? error.message : "The call couldn't be placed");
    }
    return NextResponse.json({ ok: true, callId: call.id }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
