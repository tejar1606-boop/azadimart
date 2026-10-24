import { getSessionPrincipal, hashPassword, verifyPassword } from "@azadimart/auth";
import { auditLogs, createDatabase, users } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10, "Use at least 10 characters").max(128) })
  .refine((v) => v.currentPassword !== v.newPassword, { path: ["newPassword"], message: "Choose a different password" });

/** Employees change the password HR gave them. Team members change theirs in Admin. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    const principal = await getSessionPrincipal(request, db);
    if (!principal) throw new AppError("UNAUTHORIZED", "Please sign in again");
    if (principal.role !== "EMPLOYEE") throw new AppError("FORBIDDEN", "Team members change their password in Admin");
    const input = bodySchema.parse(await request.json());
    const user = (await db.select().from(users).where(eq(users.id, principal.userId)).limit(1))[0];
    if (!user?.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash))) throw new AppError("VALIDATION_ERROR", "Your current password is wrong");
    await db.update(users).set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() }).where(eq(users.id, user.id));
    await db.insert(auditLogs).values({ actorUserId: user.id, action: "EMPLOYEE_PASSWORD_CHANGED", entityType: "user", entityId: user.id, metadata: {} });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
