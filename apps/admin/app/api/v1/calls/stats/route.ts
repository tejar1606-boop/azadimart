import { requireStaff } from "@azadimart/auth";
import { callStats, createDatabase } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Today's call numbers (since midnight India time). */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "support");
    const ist = new Date(Date.now() + 330 * 60_000);
    const since = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
    return NextResponse.json(await callStats(createDatabase(), since));
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
