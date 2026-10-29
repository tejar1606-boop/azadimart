import { auditLogs, createDatabase, employees } from "@azadimart/database";
import { AppError, employeeSchema, toApiError } from "@azadimart/shared";
import { asc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireHr } from "../../../lib/access";
import { employeeValues } from "./shared";

/** Every employee (no PAN or bank numbers in the list). */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireHr(request);
    const items = await createDatabase().select({
      id: employees.id, employeeCode: employees.employeeCode, fullName: employees.fullName, email: employees.email, designation: employees.designation, department: employees.department,
      dateOfJoining: employees.dateOfJoining, dateOfExit: employees.dateOfExit, isActive: employees.isActive, monthlyCtcPaise: employees.monthlyCtcPaise, workState: employees.workState,
      hasLogin: sql<boolean>`${employees.userId} is not null`,
    }).from(employees).orderBy(asc(employees.employeeCode));
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Adds an employee; codes run LM0001, LM0002, … */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireHr(request);
    const input = employeeSchema.parse(await request.json());
    const db = createDatabase();
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('employee_code', 0))`);
      const last = (await tx.select({ n: sql<number>`coalesce(max(substring(${employees.employeeCode} from 3)::int), 0)::int` }).from(employees))[0]?.n ?? 0;
      const created = (await tx.insert(employees).values({ employeeCode: "LM" + String(last + 1).padStart(4, "0"), ...employeeValues(input) }).onConflictDoNothing({ target: employees.email }).returning({ id: employees.id, employeeCode: employees.employeeCode }))[0];
      if (!created) throw new AppError("CONFLICT", "An employee with this email already exists");
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "EMPLOYEE_ADDED", entityType: "employee", entityId: created.id, metadata: { code: created.employeeCode } });
      return created;
    });
    return NextResponse.json({ ok: true, employee: row }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
