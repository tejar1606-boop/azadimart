import { requireStaff } from "@azadimart/auth";
import { createDatabase, roles, staffMembers, users } from "@azadimart/database";
import { and, eq, inArray } from "drizzle-orm";

/** Team members whose role includes the Support desk may work tickets. */
export async function requireSupportStaff(request: Request) {
  const db = createDatabase();
  const principal = await requireStaff(request, "support", db);
  return { db, userId: principal.userId, role: principal.role };
}

/** Everyone who can be assigned a ticket: active team members with the Support desk, with display names. */
export async function supportTeam(db: ReturnType<typeof createDatabase>) {
  const rows = await db.select({ userId: users.id, email: users.email, role: users.role, displayName: staffMembers.displayName, isActive: staffMembers.isActive, permissions: roles.permissions })
    .from(users).leftJoin(staffMembers, eq(staffMembers.userId, users.id)).leftJoin(roles, eq(roles.id, staffMembers.roleId))
    .where(and(inArray(users.role, ["ADMIN", "SUPER_ADMIN", "SUPPORT"]), eq(users.status, "ACTIVE")));
  return rows
    // With a team role: it must include Support. Without one: owner and older full admins, and older support agents.
    .filter((r) => (r.permissions ? r.isActive !== false && r.permissions.includes("support") : true))
    .map((r) => ({ userId: r.userId, email: r.email, role: r.role, name: r.displayName || r.email.split("@")[0] || r.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
