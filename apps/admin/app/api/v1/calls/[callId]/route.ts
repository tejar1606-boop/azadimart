import { requireStaff } from "@azadimart/auth";
import { acceptCall, auditLogs, createDatabase, declineCall, dismissMissedCall, endCall, saveCallNotes } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ACCEPT") }),
  z.object({ action: z.literal("DECLINE") }),
  z.object({ action: z.literal("HANGUP") }),
  z.object({ action: z.literal("DISMISS") }),
  z.object({ action: z.literal("NOTES"), outcome: z.enum(["RESOLVED", "FOLLOW_UP", "ESCALATED", "WRONG_NUMBER", "NO_RESPONSE"]).nullable().optional(), notes: z.string().trim().max(2000).nullable().optional(), orderId: uuidSchema.nullable().optional(), ticketId: uuidSchema.nullable().optional() }),
]);

/** Answer, decline, hang up, dismiss a missed call, or save notes and outcome. */
export async function PATCH(request: Request, { params }: { params: Promise<{ callId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "support");
    const { callId } = await params;
    if (!uuidSchema.safeParse(callId).success) throw new AppError("NOT_FOUND", "Call not found");
    const input = schema.parse(await request.json());
    const db = createDatabase();
    switch (input.action) {
      case "ACCEPT": await acceptCall(db, callId, principal.userId); break;
      case "DECLINE": await declineCall(db, callId, principal.userId); break;
      case "HANGUP": await endCall(db, callId, principal.userId); break;
      case "DISMISS": await dismissMissedCall(db, callId, principal.userId); break;
      case "NOTES":
        await saveCallNotes(db, callId, principal.userId, input);
        await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "CALL_NOTES_SAVED", entityType: "call", entityId: callId, metadata: { outcome: input.outcome ?? null } });
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
