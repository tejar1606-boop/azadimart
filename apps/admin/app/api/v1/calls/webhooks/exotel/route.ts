import { auditLogs, calls, createDatabase, createInboundCall } from "@azadimart/database";
import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Exotel → LOIMART. Set this URL (with ?token=TELEPHONY_WEBHOOK_TOKEN) as:
 * - the Passthru applet in the incoming-call flow (GET: CallSid, CallFrom, CallTo, digits) → the call is queued
 *   for an agent and their screen shows who is calling;
 * - the StatusCallback of outgoing calls (POST: CallSid, Status, RecordingUrl, ConversationDuration).
 */
function authorised(request: Request) {
  const expected = process.env.TELEPHONY_WEBHOOK_TOKEN ?? "";
  const got = new URL(request.url).searchParams.get("token") ?? "";
  return expected.length >= 16 && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
const IVR: Record<string, string> = { "1": "ORDERS", "2": "SELLERS", "3": "OTHER" };

export async function GET(request: Request) {
  if (!authorised(request)) return new NextResponse("forbidden", { status: 403 });
  const p = new URL(request.url).searchParams;
  const sid = p.get("CallSid"), from = p.get("CallFrom") ?? p.get("From");
  if (sid && from) await createInboundCall(createDatabase(), { phone: from, provider: "exotel", providerCallId: sid, ivrChoice: IVR[(p.get("digits") ?? "").replace(/\D/g, "")] ?? null, businessNumber: p.get("CallTo") ?? p.get("To") });
  return new NextResponse("ok", { status: 200 });
}

export async function POST(request: Request) {
  if (!authorised(request)) return new NextResponse("forbidden", { status: 403 });
  const form = await request.formData().catch(() => null);
  const get = (k: string) => (form?.get(k) ?? null) as string | null;
  const sid = get("CallSid"), status = (get("Status") ?? "").toLowerCase();
  if (!sid) return new NextResponse("ok");
  const db = createDatabase();
  const now = new Date();
  const mapped = status === "completed" ? "COMPLETED" : status === "no-answer" || status === "busy" ? "NO_ANSWER" : status === "failed" ? "FAILED" : null;
  if (mapped) {
    const duration = Number(get("ConversationDuration") ?? 0) || 0;
    const updated = await db.update(calls).set({ status: mapped, endedAt: now, durationSeconds: duration, recordingUrl: get("RecordingUrl"), updatedAt: now })
      .where(and(eq(calls.provider, "exotel"), eq(calls.providerCallId, sid))).returning({ id: calls.id });
    if (updated[0]) await db.insert(auditLogs).values({ actorUserId: null, action: "CALL_STATUS_" + mapped, entityType: "call", entityId: updated[0].id, metadata: { duration } });
  }
  return new NextResponse("ok", { status: 200 });
}
