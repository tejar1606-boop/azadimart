import { requireStaff } from "@azadimart/auth";
import { createDatabase, tcsTdsReport } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** TCS (GSTR-8) and TDS (194-O) per seller for one month, e.g. ?month=2026-10. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "payments");
    const month = new URL(request.url).searchParams.get("month") ?? "";
    const report = await tcsTdsReport(createDatabase(), month);
    if (!report) throw new AppError("VALIDATION_ERROR", "Choose a month like 2026-10");
    return NextResponse.json(report);
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
