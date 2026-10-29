import { createDatabase, creditDueOrderCashback, rewardDueCustomerReferrals } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { cronCaller } from "../../../lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily: Refer & earn rewards and order cashback for delivered orders kept past the return window. */
async function run(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (!(await cronCaller(request))) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not allowed" } }, { status: 401 });
    const db = createDatabase();
    return NextResponse.json({ ok: true, ...(await rewardDueCustomerReferrals(db)), cashback: await creditDueOrderCashback(db) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export const GET = run;
export const POST = run;
