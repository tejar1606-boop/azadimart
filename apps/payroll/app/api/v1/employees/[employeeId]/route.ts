import { auditLogs, createDatabase, employees } from "@azadimart/database";
import { AppError, employeeSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHr } from "../../../../lib/access";
import { employeeValues } from "../shared";

const patchSchema = employeeSchema.and(z.object({ dateOfExit: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }));

async function load(id: string) {
  if (!uuidSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Employee not found");
  const row = (await createDatabase().select().from(employees).where(eq(employees.id, id)).limit(1))[0];
  if (!row) throw new AppError("NOT_FOUND", "Employee not found");
  return row;
}

/** One employee for the edit form: PAN and bank account only as their last 4. */
export async function GET(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    await requireHr(request);
    const { panEncrypted: _pan, bankAccountEncrypted: _bank, ...row } = await load((await params).employeeId); void _pan; void _bank;
    return NextResponse.json({ employee: { ...row, hasLogin: Boolean(row.userId) } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Saves changes. A blank bank account number keeps the saved one. Changes apply to draft and future payroll only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireHr(request);
    const current = await load((await params).employeeId);
    const input = patchSchema.parse(await request.json());
    const db = createDatabase();
    const exit = input.dateOfExit ?? null;
    if (exit && exit < input.dateOfJoining) throw new AppError("VALIDATION_ERROR", "The exit date is before the joining date");
    await db.update(employees).set({ ...employeeValues(input), dateOfExit: exit, isActive: !exit || exit >= new Date().toISOString().slice(0, 10), updatedAt: new Date() }).where(eq(employees.id, current.id));
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "EMPLOYEE_UPDATED", entityType: "employee", entityId: current.id, metadata: { code: current.employeeCode, ctcChanged: current.monthlyCtcPaise !== input.monthlyCtcPaise, exit } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
