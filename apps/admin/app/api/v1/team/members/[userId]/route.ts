import { hashPassword, requireStaff, revokeUserSessions } from "@azadimart/auth";
import { auditLogs, createDatabase, roles, staffMembers, supportTickets, users } from "@azadimart/database";
import { AppError, staffMemberUpdateSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertWithin, teamMembers } from "../../team";

export const dynamic = "force-dynamic";

/**
 * Change a team member's role or name, reset their password, or switch them
 * off/on. You can't change yourself, the owner (unless you are the owner), or
 * anyone with more access than you.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    const me = await requireStaff(request, "team", db);
    const userId = uuidSchema.parse((await params).userId);
    const input = staffMemberUpdateSchema.parse(await request.json());
    if (userId === me.userId) throw new AppError("FORBIDDEN", "You can't change your own access. Ask another admin.");
    const target = (await teamMembers(db)).find((m) => m.userId === userId);
    if (!target) throw new AppError("NOT_FOUND", "Team member not found");
    if (target.isOwner && me.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN", "Only the owner can change the owner");
    assertWithin(me, target.permissions, "change someone");

    const now = new Date();
    let roleId = target.roleId;
    if (input.roleId) {
      const role = (await db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1))[0];
      if (!role) throw new AppError("VALIDATION_ERROR", "Choose a role");
      assertWithin(me, role.permissions, "give a role");
      roleId = role.id;
    }
    if (!target.isOwner && (input.roleId || input.displayName || input.isActive !== undefined)) {
      // Older admins get a team record the first time they're changed (Admin role keeps full access).
      if (!roleId) roleId = (await db.select({ id: roles.id }).from(roles).where(eq(roles.name, "Admin")).limit(1))[0]?.id ?? null;
      if (!roleId) throw new AppError("VALIDATION_ERROR", "Choose a role");
      const values = { displayName: input.displayName ?? target.name, roleId, isActive: input.isActive ?? target.isActive, updatedAt: now };
      await db.insert(staffMembers).values({ userId, createdByUserId: me.userId, ...values }).onConflictDoUpdate({ target: staffMembers.userId, set: values });
    }
    if (input.isActive === false) {
      await db.update(users).set({ status: "DISABLED", updatedAt: now }).where(eq(users.id, userId));
      await revokeUserSessions(db, userId);
      await db.update(supportTickets).set({ assignedToUserId: null }).where(and(eq(supportTickets.assignedToUserId, userId), inArray(supportTickets.status, ["OPEN", "IN_PROGRESS", "WAITING"])));
    } else if (input.isActive === true) {
      await db.update(users).set({ status: "ACTIVE", updatedAt: now }).where(eq(users.id, userId));
    }
    if (input.password) {
      await db.update(users).set({ passwordHash: await hashPassword(input.password), updatedAt: now }).where(eq(users.id, userId));
      await revokeUserSessions(db, userId);
    }
    await db.insert(auditLogs).values({ actorUserId: me.userId, action: "TEAM_MEMBER_UPDATED", entityType: "user", entityId: userId, metadata: { ...input, password: input.password ? "reset" : undefined } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
