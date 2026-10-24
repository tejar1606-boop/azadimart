import { requireStaff } from "@azadimart/auth";
import { createDatabase, getPlatformSetting, setPlatformSetting } from "@azadimart/database";
import { AppError, DEFAULT_SETTLEMENT_CYCLE, SETTLEMENT_CYCLE_KEY, nextSettlementDate, toApiError, type SettlementCycle } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** How often sellers are settled: every 15 days (1st and 16th, default) or daily. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "payments");
    const cycle = (await getPlatformSetting<SettlementCycle>(createDatabase(), SETTLEMENT_CYCLE_KEY)) ?? DEFAULT_SETTLEMENT_CYCLE;
    return NextResponse.json({ cycle, nextAt: nextSettlementDate(new Date(), cycle) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "payments");
    const cycle = ((await request.json().catch(() => ({}))) as { cycle?: string }).cycle;
    if (cycle !== "FORTNIGHTLY" && cycle !== "DAILY") throw new AppError("VALIDATION_ERROR", "Choose FORTNIGHTLY or DAILY");
    await setPlatformSetting(createDatabase(), SETTLEMENT_CYCLE_KEY, cycle, principal.userId);
    return NextResponse.json({ ok: true, cycle, nextAt: nextSettlementDate(new Date(), cycle) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
