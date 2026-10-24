import { createDatabase, payrollRuns, payslips } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { and, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireEmployee } from "../../../../lib/access";

/** The signed-in employee's issued payslips (never drafts), newest first. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    const me = await requireEmployee(request, db);
    const items = await db.select({ id: payslips.id, month: payslips.month, grossPaise: payslips.grossPaise, totalDeductionsPaise: payslips.totalDeductionsPaise, netPaise: payslips.netPaise, paidDays: payslips.paidDays, status: payrollRuns.status })
      .from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payslips.employeeId, me.employeeId), ne(payrollRuns.status, "DRAFT"))).orderBy(desc(payslips.month));
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
