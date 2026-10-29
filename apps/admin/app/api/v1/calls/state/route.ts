import { requireStaff } from "@azadimart/auth";
import { agentState, createDatabase } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { telephony } from "../../../../lib/telephony";

export const dynamic = "force-dynamic";

/** Polled by the agent's screen: their status, current/ringing call with caller details, queue and missed counts. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "support");
    const line = telephony();
    return NextResponse.json({ ...(await agentState(createDatabase(), principal.userId)), line: line ? { name: line.name, number: line.businessNumber } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
