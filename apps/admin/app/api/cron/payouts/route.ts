import { createDatabase } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { cronCaller } from "../../../lib/cron-auth";
import { runPayouts } from "../../../lib/payouts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily: pays sellers for items delivered 7+ days ago (see lib/payouts). Also runnable by admins from Finance. */
async function run(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (!(await cronCaller(request))) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not allowed" } }, { status: 401 });
    return NextResponse.json({ ok: true, ...(await runPayouts(createDatabase())) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export const GET = run;
export const POST = run;
