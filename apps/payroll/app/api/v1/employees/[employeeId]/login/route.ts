import { hashPassword, revokeUserSessions } from "@azadimart/auth";
import { auditLogs, createDatabase, employees, users } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHr } from "../../../../../lib/access";

const bodySchema = z.object({ password: z.string().min(10, "Use at least 10 characters").max(128) });

/**
 * Gives an employee a Payroll login (email + the password HR sets, to share
 * privately), or resets it. A team member who already has a LOIMART admin
 * account is simply linked: they sign in with their team password.
 */
export async function POST(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireHr(request);
    const { employeeId } = await params;
    if (!uuidSchema.safeParse(employeeId).success) throw new AppError("NOT_FOUND", "Employee not found");
    const { password } = bodySchema.parse(await request.json());
    const db = createDatabase();
    const result = await db.transaction(async (tx) => {
      const emp = (await tx.select().from(employees).where(eq(employees.id, employeeId)).limit(1).for("update"))[0];
      if (!emp) throw new AppError("NOT_FOUND", "Employee not found");
      const linked = emp.userId ? (await tx.select().from(users).where(eq(users.id, emp.userId)).limit(1))[0] : undefined;
      const existing = linked ?? (await tx.select().from(users).where(eq(users.email, emp.email)).limit(1))[0];
      if (existing && existing.role !== "EMPLOYEE") {
        if (["ADMIN", "SUPER_ADMIN", "SUPPORT"].includes(existing.role)) {
          await tx.update(employees).set({ userId: existing.id, updatedAt: new Date() }).where(eq(employees.id, emp.id));
          return { mode: "linked-team" as const, userId: existing.id };
        }
        throw new AppError("CONFLICT", "This email is already used by a LOIMART shopper or seller account. Use the employee's work email.");
      }
      const passwordHash = await hashPassword(password);
      const user = existing
        ? (await tx.update(users).set({ passwordHash, status: "ACTIVE", updatedAt: new Date() }).where(eq(users.id, existing.id)).returning({ id: users.id }))[0]!
        : (await tx.insert(users).values({ email: emp.email, passwordHash, role: "EMPLOYEE", status: "ACTIVE" }).returning({ id: users.id }))[0]!;
      await tx.update(employees).set({ userId: user.id, updatedAt: new Date() }).where(eq(employees.id, emp.id));
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: existing ? "EMPLOYEE_LOGIN_RESET" : "EMPLOYEE_LOGIN_CREATED", entityType: "employee", entityId: emp.id, metadata: { code: emp.employeeCode } });
      return { mode: existing ? ("reset" as const) : ("created" as const), userId: user.id };
    });
    if (result.mode === "reset") await revokeUserSessions(db, result.userId);
    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
