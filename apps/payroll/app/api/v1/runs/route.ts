import { createDatabase, createPayrollRun, payrollRuns, payslips } from "@azadimart/database";
import { payrollMonthSchema, toApiError } from "@azadimart/shared";
import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHr } from "../../../lib/access";

/** Every month's payroll with its totals, newest first. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireHr(request);
    const items = await createDatabase().select({
      id: payrollRuns.id, month: payrollRuns.month, status: payrollRuns.status, finalisedAt: payrollRuns.finalisedAt, paidAt: payrollRuns.paidAt,
      employees: sql<number>`count(${payslips.id})::int`, grossPaise: sql<number>`coalesce(sum(${payslips.grossPaise}), 0)::int`, netPaise: sql<number>`coalesce(sum(${payslips.netPaise}), 0)::int`,
    }).from(payrollRuns).leftJoin(payslips, eq(payslips.runId, payrollRuns.id)).groupBy(payrollRuns.id).orderBy(desc(payrollRuns.month));
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Starts a month's payroll (draft) for everyone employed that month. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireHr(request);
    const { month } = z.object({ month: payrollMonthSchema }).parse(await request.json());
    const run = await createPayrollRun(createDatabase(), month, principal.userId);
    return NextResponse.json({ ok: true, run }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
