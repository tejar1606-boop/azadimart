import { AppError, calculatePayslip, daysInMonth, type PayLine } from "@azadimart/shared";
import { and, asc, eq, isNull, lte, or, gte } from "drizzle-orm";
import type { createDatabase } from "./client";
import { getCompanyDetails } from "./invoices";
import { auditLogs, employees, payrollRuns, payslips, type PayslipDetails } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Adjustments = { lopDays: number; extraEarnings: Array<{ label: string; amountPaise: number }>; extraDeductions: Array<{ label: string; amountPaise: number }>; tdsOverridePaise: number | null; note: string | null };
const NO_ADJUSTMENTS: Adjustments = { lopDays: 0, extraEarnings: [], extraDeductions: [], tdsOverridePaise: null, note: null };

const monthParts = (month: string) => { const [y, m] = month.split("-").map(Number); return { year: y!, month: m! }; };
const lines = (list: Array<{ label: string; amountPaise: number }>, prefix: string): PayLine[] => list.map((l, i) => ({ code: `${prefix}${i + 1}`, label: l.label, amountPaise: l.amountPaise }));

/** The payslip row for one employee and month, from their current salary details and HR's adjustments. */
async function payslipValues(tx: Tx | Db, employee: typeof employees.$inferSelect, month: string, adj: Adjustments) {
  const { year, month: m } = monthParts(month);
  const company = await getCompanyDetails(tx);
  // Joined or left during the month: days outside employment count as unpaid.
  const days = daysInMonth(year, m);
  const monthStart = `${month}-01`, monthEnd = `${month}-${String(days).padStart(2, "0")}`;
  const notEmployed = (employee.dateOfJoining > monthStart ? Number(employee.dateOfJoining.slice(8)) - 1 : 0)
    + (employee.dateOfExit && employee.dateOfExit < monthEnd ? days - Number(employee.dateOfExit.slice(8)) : 0);
  const p = calculatePayslip(employee, {
    year, month: m, lopDays: Math.min(days, adj.lopDays + notEmployed),
    extraEarnings: lines(adj.extraEarnings, "ADD"), extraDeductions: lines(adj.extraDeductions, "DED"), tdsOverridePaise: adj.tdsOverridePaise,
  });
  const details: PayslipDetails = {
    employee: { code: employee.employeeCode, name: employee.fullName, designation: employee.designation, department: employee.department, dateOfJoining: employee.dateOfJoining, workState: employee.workState, panLast4: employee.panLast4, uan: employee.uan, esiNumber: employee.esiNumber, bankLast4: employee.bankAccountLast4, ifsc: employee.ifsc },
    company: { legalName: company.legalName, address: company.address },
    monthlyCtcPaise: employee.monthlyCtcPaise,
  };
  return {
    daysInMonth: p.daysInMonth, paidDays: String(p.paidDays), lopDays: String(adj.lopDays),
    earnings: p.earnings, deductions: p.deductions, employerContributions: p.employerContributions,
    adjustments: { extraEarnings: adj.extraEarnings, extraDeductions: adj.extraDeductions, tdsOverridePaise: adj.tdsOverridePaise, note: adj.note },
    grossPaise: p.grossPaise, totalDeductionsPaise: p.totalDeductionsPaise, netPaise: p.netPaise, details,
  };
}

/** Starts a month's payroll (DRAFT) with a payslip for everyone employed during that month. */
export async function createPayrollRun(db: Db, month: string, userId: string) {
  const { year, month: m } = monthParts(month);
  const monthStart = `${month}-01`, monthEnd = `${month}-${String(daysInMonth(year, m)).padStart(2, "0")}`;
  return db.transaction(async (tx) => {
    const existing = (await tx.select().from(payrollRuns).where(eq(payrollRuns.month, month)).limit(1))[0];
    if (existing) throw new AppError("CONFLICT", "Payroll for this month already exists");
    const staff = await tx.select().from(employees)
      .where(and(lte(employees.dateOfJoining, monthEnd), or(isNull(employees.dateOfExit), gte(employees.dateOfExit, monthStart))))
      .orderBy(asc(employees.employeeCode));
    if (!staff.length) throw new AppError("UNPROCESSABLE", "No employees were working in this month");
    const run = (await tx.insert(payrollRuns).values({ month, createdByUserId: userId }).returning())[0]!;
    for (const e of staff) await tx.insert(payslips).values({ runId: run.id, employeeId: e.id, month, ...(await payslipValues(tx, e, month, NO_ADJUSTMENTS)) });
    await tx.insert(auditLogs).values({ actorUserId: userId, action: "PAYROLL_RUN_CREATED", entityType: "payroll_run", entityId: run.id, metadata: { month, employees: staff.length } });
    return run;
  });
}

/** HR changes LOP days, bonus, other deductions or TDS on a draft payslip: recalculated from the employee's details. */
export async function adjustPayslip(db: Db, payslipId: string, adj: Adjustments, userId: string) {
  return db.transaction(async (tx) => {
    const row = (await tx.select({ slip: payslips, run: payrollRuns, emp: employees }).from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).innerJoin(employees, eq(employees.id, payslips.employeeId))
      .where(eq(payslips.id, payslipId)).limit(1))[0];
    if (!row) throw new AppError("NOT_FOUND", "Payslip not found");
    if (row.run.status !== "DRAFT") throw new AppError("CONFLICT", "This month's payroll is finalised; payslips can't be changed");
    const values = await payslipValues(tx, row.emp, row.slip.month, adj);
    const updated = (await tx.update(payslips).set({ ...values, updatedAt: new Date() }).where(eq(payslips.id, payslipId)).returning())[0]!;
    await tx.insert(auditLogs).values({ actorUserId: userId, action: "PAYSLIP_ADJUSTED", entityType: "payslip", entityId: payslipId, metadata: { month: row.slip.month, employee: row.emp.employeeCode, lopDays: adj.lopDays, net: updated.netPaise } });
    return updated;
  });
}

/** Recalculates every draft payslip (e.g. after a salary change), keeping HR's adjustments. */
export async function refreshPayrollRun(db: Db, runId: string, userId: string) {
  return db.transaction(async (tx) => {
    const run = (await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1))[0];
    if (!run) throw new AppError("NOT_FOUND", "Payroll not found");
    if (run.status !== "DRAFT") throw new AppError("CONFLICT", "This month's payroll is finalised");
    const rows = await tx.select({ slip: payslips, emp: employees }).from(payslips).innerJoin(employees, eq(employees.id, payslips.employeeId)).where(eq(payslips.runId, runId));
    for (const { slip, emp } of rows) {
      const adj = { ...slip.adjustments, lopDays: Number(slip.lopDays) };
      await tx.update(payslips).set({ ...(await payslipValues(tx, emp, slip.month, adj)), updatedAt: new Date() }).where(eq(payslips.id, slip.id));
    }
    await tx.insert(auditLogs).values({ actorUserId: userId, action: "PAYROLL_RUN_REFRESHED", entityType: "payroll_run", entityId: runId, metadata: { month: run.month } });
  });
}

/** DRAFT → FINALISED (payslips issued to employees, locked) → PAID (salaries sent). */
export async function setPayrollStatus(db: Db, runId: string, status: "FINALISED" | "PAID", userId: string, paymentReference?: string | null) {
  const from = status === "FINALISED" ? "DRAFT" : "FINALISED";
  const now = new Date();
  const updated = (await db.update(payrollRuns).set(status === "FINALISED" ? { status, finalisedAt: now, finalisedByUserId: userId, updatedAt: now } : { status, paidAt: now, paymentReference: paymentReference ?? null, updatedAt: now })
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.status, from))).returning())[0];
  if (!updated) throw new AppError("CONFLICT", status === "FINALISED" ? "Only a draft payroll can be finalised" : "Only a finalised payroll can be marked paid");
  await db.insert(auditLogs).values({ actorUserId: userId, action: "PAYROLL_" + status, entityType: "payroll_run", entityId: runId, metadata: { month: updated.month, paymentReference: paymentReference ?? null } });
  return updated;
}

/** Deletes a draft month (e.g. created by mistake). Finalised payroll is never deleted. */
export async function deleteDraftPayroll(db: Db, runId: string, userId: string) {
  const gone = (await db.delete(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.status, "DRAFT"))).returning())[0];
  if (!gone) throw new AppError("CONFLICT", "Only a draft payroll can be deleted");
  await db.insert(auditLogs).values({ actorUserId: userId, action: "PAYROLL_RUN_DELETED", entityType: "payroll_run", entityId: runId, metadata: { month: gone.month } });
}
