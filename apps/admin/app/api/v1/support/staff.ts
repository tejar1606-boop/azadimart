import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, supportAgents, users } from "@azadimart/database";
import { SUPPORT_DESK_ROLES } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";

/** Admins and SUPPORT agents may work tickets. */
export async function requireSupportStaff(request: Request) {
  const principal = await requireApiAccess(request, "admin", SUPPORT_DESK_ROLES);
  return { db: createDatabase(), userId: principal.userId, role: principal.role };
}

/** Everyone who can be assigned a ticket: active admins and support agents, with display names. */
export async function supportTeam(db: ReturnType<typeof createDatabase>) {
  const rows = await db.select({ userId: users.id, email: users.email, role: users.role, displayName: supportAgents.displayName, isActive: supportAgents.isActive })
    .from(users).leftJoin(supportAgents, eq(supportAgents.userId, users.id))
    .where(and(inArray(users.role, SUPPORT_DESK_ROLES), eq(users.status, "ACTIVE")));
  return rows
    .filter((r) => r.isActive !== false && (r.role !== "SUPPORT" || r.displayName))
    .map((r) => ({ userId: r.userId, email: r.email, role: r.role, name: r.displayName || r.email.split("@")[0]! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
