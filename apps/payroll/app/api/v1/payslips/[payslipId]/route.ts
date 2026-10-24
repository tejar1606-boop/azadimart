import { adjustPayslip, createDatabase, payrollRuns, payslips } from "@azadimart/database";
import { AppError, payslipAdjustSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireHr, viewerFor } from "../../../../lib/access";

/** A payslip: HR sees any; an employee only their own, once the month is finalised. */
export async function GET(request: Request, { params }: { params: Promise<{ payslipId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { payslipId } = await params;
    if (!uuidSchema.safeParse(payslipId).success) throw new AppError("NOT_FOUND", "Payslip not found");
    const db = createDatabase();
    const viewer = await viewerFor(db, request);
    if (!viewer) throw new AppError("UNAUTHORIZED", "Please sign in again");
    const row = (await db.select({ slip: payslips, status: payrollRuns.status }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).where(eq(payslips.id, payslipId)).limit(1))[0];
    const mine = row && row.slip.employeeId === viewer.employeeId && row.status !== "DRAFT";
    if (!row || (!viewer.hr && !mine)) throw new AppError("NOT_FOUND", "Payslip not found");
    return NextResponse.json({ payslip: { ...row.slip, runStatus: row.status } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** HR: LOP days, bonus / other earnings, other deductions, TDS override on a draft payslip. */
export async function PATCH(request: Request, { params }: { params: Promise<{ payslipId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireHr(request);
    const { payslipId } = await params;
    if (!uuidSchema.safeParse(payslipId).success) throw new AppError("NOT_FOUND", "Payslip not found");
    const input = payslipAdjustSchema.parse(await request.json());
    const updated = await adjustPayslip(createDatabase(), payslipId, { ...input, note: input.note ?? null }, principal.userId);
    return NextResponse.json({ ok: true, payslip: updated });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
