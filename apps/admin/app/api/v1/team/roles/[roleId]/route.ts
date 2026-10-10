import { requireStaff } from "@azadimart/auth";
import { auditLogs, createDatabase, roles, staffMembers } from "@azadimart/database";
import { AppError, staffRoleUpdateSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertWithin } from "../../team";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ roleId: string }> };

async function loadRole(db: ReturnType<typeof createDatabase>, roleId: string) {
  const role = (await db.select().from(roles).where(eq(roles.id, roleId)).limit(1))[0];
  if (!role) throw new AppError("NOT_FOUND", "Role not found");
  return role;
}

/** Edits a role; everyone with it gets the new areas straight away. */
export async function PATCH(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    const me = await requireStaff(request, "team", db);
    const roleId = uuidSchema.parse((await params).roleId);
    const input = staffRoleUpdateSchema.parse(await request.json());
    const role = await loadRole(db, roleId);
    if (me.roleId === roleId) throw new AppError("FORBIDDEN", "You can't edit your own role. Ask another admin.");
    assertWithin(me, role.permissions, "edit a role");
    if (input.permissions) assertWithin(me, input.permissions, "edit a role");
    if (input.name && (await db.select({ id: roles.id }).from(roles).where(and(ne(roles.id, roleId), sql`lower(${roles.name}) = lower(${input.name})`)).limit(1))[0]) throw new AppError("CONFLICT", "A role with this name already exists");
    await db.update(roles).set({ ...input, ...(input.permissions ? { permissions: [...new Set(input.permissions)] } : {}), updatedAt: new Date() }).where(eq(roles.id, roleId));
    await db.insert(auditLogs).values({ actorUserId: me.userId, action: "TEAM_ROLE_UPDATED", entityType: "role", entityId: roleId, metadata: { before: role.permissions, ...input } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Deletes a custom role nobody has. */
export async function DELETE(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    const me = await requireStaff(request, "team", db);
    const roleId = uuidSchema.parse((await params).roleId);
    const role = await loadRole(db, roleId);
    if (role.isSystem) throw new AppError("CONFLICT", "Ready-made roles can be edited but not deleted");
    assertWithin(me, role.permissions, "delete a role");
    const [used] = await db.select({ n: count() }).from(staffMembers).where(eq(staffMembers.roleId, roleId));
    if (Number(used?.n ?? 0) > 0) throw new AppError("CONFLICT", "Move the people in this role to another role first");
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.insert(auditLogs).values({ actorUserId: me.userId, action: "TEAM_ROLE_DELETED", entityType: "role", entityId: roleId, metadata: { name: role.name } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
