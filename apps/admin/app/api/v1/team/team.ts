import { type StaffAccess } from "@azadimart/auth";
import { createDatabase, roles, staffMembers, users } from "@azadimart/database";
import { AppError, DEFAULT_STAFF_ROLES, STAFF_PERMISSION_KEYS, isStaffPermission, type StaffPermission } from "@azadimart/shared";
import { eq, inArray, sql } from "drizzle-orm";

type Db = ReturnType<typeof createDatabase>;

/** Creates the ready-made roles the first time the team page is used. */
export async function ensureDefaultRoles(db: Db) {
  await db.insert(roles).values(DEFAULT_STAFF_ROLES.map((r) => ({ name: r.name, description: r.description, permissions: r.permissions, isSystem: true }))).onConflictDoNothing({ target: roles.name });
}

/** Nobody can hand out more access than they have themselves. */
export function assertWithin(actor: StaffAccess, permissions: readonly string[], what: string) {
  const extra = permissions.filter((p) => !actor.permissions.includes(p as StaffPermission));
  if (extra.length) throw new AppError("FORBIDDEN", `You can't ${what} with areas you don't have yourself`);
}

/** Every admin-portal user with their effective role. */
export async function teamMembers(db: Db) {
  const rows = await db.select({
    userId: users.id, email: users.email, userRole: users.role, status: users.status, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
    displayName: staffMembers.displayName, isActive: staffMembers.isActive, roleId: roles.id, roleName: roles.name, permissions: roles.permissions,
  }).from(users).leftJoin(staffMembers, eq(staffMembers.userId, users.id)).leftJoin(roles, eq(roles.id, staffMembers.roleId))
    .where(inArray(users.role, ["ADMIN", "SUPER_ADMIN", "SUPPORT"]));
  return rows.map((r) => {
    const legacy = !r.roleId;
    const permissions: StaffPermission[] = r.userRole === "SUPER_ADMIN" || (legacy && r.userRole === "ADMIN") ? [...STAFF_PERMISSION_KEYS] : legacy ? ["support"] : (r.permissions ?? []).filter(isStaffPermission);
    return {
      userId: r.userId, email: r.email, name: r.displayName || r.email.split("@")[0] || r.email,
      isOwner: r.userRole === "SUPER_ADMIN", roleId: r.roleId, permissions,
      roleName: r.userRole === "SUPER_ADMIN" ? "Owner" : r.roleName ?? (r.userRole === "ADMIN" ? "Admin (full access)" : "Support agent"),
      isActive: r.status === "ACTIVE" && r.isActive !== false, lastLoginAt: r.lastLoginAt, createdAt: r.createdAt,
    };
  }).sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name));
}

export async function roleMemberCounts(db: Db) {
  const rows = await db.select({ roleId: staffMembers.roleId, n: sql<number>`count(*)::int` }).from(staffMembers).groupBy(staffMembers.roleId);
  return new Map(rows.map((r) => [r.roleId, Number(r.n)]));
}
