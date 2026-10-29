import { requireStaff } from "@azadimart/auth";
import { createDatabase, setAgentStatus } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

/** The agent goes Available (takes calls), Away or Offline. */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "support");
    const { status } = z.object({ status: z.enum(["AVAILABLE", "AWAY", "OFFLINE"]) }).parse(await request.json());
    await setAgentStatus(createDatabase(), principal.userId, status);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
