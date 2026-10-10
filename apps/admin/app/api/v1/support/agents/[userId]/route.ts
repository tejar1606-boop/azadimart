import { requireApiAccess, revokeUserSessions } from "@azadimart/auth";
import { auditLogs, createDatabase, supportAgents, supportTickets, users } from "@azadimart/database";
import { AppError, supportAgentUpdateSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Rename or switch off a support-team member. Switching off an agent signs them out and frees their tickets. */
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    const userId = uuidSchema.parse((await params).userId);
    const input = supportAgentUpdateSchema.parse(await request.json());
    const user = (await db.select({ id: users.id, role: users.role, email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!user || !["ADMIN", "SUPER_ADMIN", "SUPPORT"].includes(user.role)) throw new AppError("NOT_FOUND", "Team member not found");
    const existing = (await db.select().from(supportAgents).where(eq(supportAgents.userId, userId)).limit(1))[0];
    const values = { displayName: input.displayName ?? existing?.displayName ?? user.email.split("@")[0]!, isActive: input.isActive ?? existing?.isActive ?? true, updatedAt: new Date() };
    if (existing) await db.update(supportAgents).set(values).where(eq(supportAgents.userId, userId));
    else await db.insert(supportAgents).values({ userId, ...values });
    if (input.isActive === false) {
      await db.update(supportTickets).set({ assignedToUserId: null }).where(and(eq(supportTickets.assignedToUserId, userId), inArray(supportTickets.status, ["OPEN", "IN_PROGRESS", "WAITING"])));
      if (user.role === "SUPPORT") { await db.update(users).set({ status: "DISABLED" }).where(eq(users.id, userId)); await revokeUserSessions(db, userId); }
    } else if (input.isActive === true && user.role === "SUPPORT") {
      await db.update(users).set({ status: "ACTIVE" }).where(eq(users.id, userId));
    }
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "SUPPORT_AGENT_UPDATED", entityType: "user", entityId: userId, metadata: input });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
