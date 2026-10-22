import { decryptSecret } from "@azadimart/auth";
import { auditLogs, createDatabase, employees, payrollRuns, payslips } from "@azadimart/database";
import { AppError, toApiError, toCsv, uuidSchema } from "@azadimart/shared";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireHr } from "../../../../../lib/access";

/** Salary transfer sheet for the bank (name, account, IFSC, amount) for a finalised month. Every download is logged. */
export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireHr(request);
    const { runId } = await params;
    if (!uuidSchema.safeParse(runId).success) throw new AppError("NOT_FOUND", "Payroll not found");
    const db = createDatabase();
    const run = (await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1))[0];
    if (!run) throw new AppError("NOT_FOUND", "Payroll not found");
    if (run.status === "DRAFT") throw new AppError("CONFLICT", "Finalise the payroll before downloading the bank sheet");
    const rows = await db.select({ code: employees.employeeCode, name: employees.fullName, account: employees.bankAccountEncrypted, ifsc: employees.ifsc, net: payslips.netPaise })
      .from(payslips).innerJoin(employees, eq(employees.id, payslips.employeeId)).where(eq(payslips.runId, runId)).orderBy(asc(employees.employeeCode));
    const csv = toCsv([["Employee code", "Name", "Account number", "IFSC", "Amount (₹)", "Narration"],
      ...rows.map((r) => [r.code, r.name, r.account ? decryptSecret(r.account) : "MISSING", r.ifsc ?? "MISSING", (r.net / 100).toFixed(2), `LOIMART salary ${run.month}`])]);
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "PAYROLL_BANK_FILE_DOWNLOADED", entityType: "payroll_run", entityId: run.id, metadata: { month: run.month, rows: rows.length } });
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="loimart-salaries-${run.month}.csv"`, "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
