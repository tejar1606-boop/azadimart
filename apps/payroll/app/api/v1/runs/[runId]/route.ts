import { createDatabase, deleteDraftPayroll, employees, payrollRuns, payslips, refreshPayrollRun, setPayrollStatus } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHr } from "../../../../lib/access";

const id = async (params: Promise<{ runId: string }>) => { const { runId } = await params; if (!uuidSchema.safeParse(runId).success) throw new AppError("NOT_FOUND", "Payroll not found"); return runId; };

/** A month's payroll with every payslip. */
export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    await requireHr(request);
    const runId = await id(params);
    const db = createDatabase();
    const run = (await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1))[0];
    if (!run) throw new AppError("NOT_FOUND", "Payroll not found");
    const items = await db.select({
      id: payslips.id, employeeId: payslips.employeeId, code: employees.employeeCode, name: employees.fullName, designation: employees.designation,
      paidDays: payslips.paidDays, lopDays: payslips.lopDays, daysInMonth: payslips.daysInMonth, grossPaise: payslips.grossPaise, totalDeductionsPaise: payslips.totalDeductionsPaise, netPaise: payslips.netPaise,
      earnings: payslips.earnings, deductions: payslips.deductions, employerContributions: payslips.employerContributions, adjustments: payslips.adjustments, bankLast4: employees.bankAccountLast4,
    }).from(payslips).innerJoin(employees, eq(employees.id, payslips.employeeId)).where(eq(payslips.runId, runId)).orderBy(asc(employees.employeeCode));
    return NextResponse.json({ run, items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

const actionSchema = z.object({ action: z.enum(["REFRESH", "FINALISE", "PAID"]), paymentReference: z.string().trim().max(120).optional() });
/** REFRESH (recalculate a draft), FINALISE (issue payslips to employees, locked) or PAID (salaries sent). */
export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireHr(request);
    const runId = await id(params);
    const input = actionSchema.parse(await request.json());
    const db = createDatabase();
    if (input.action === "REFRESH") await refreshPayrollRun(db, runId, principal.userId);
    else await setPayrollStatus(db, runId, input.action === "FINALISE" ? "FINALISED" : "PAID", principal.userId, input.paymentReference);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireHr(request);
    await deleteDraftPayroll(createDatabase(), await id(params), principal.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
