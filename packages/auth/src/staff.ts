import { createDatabase, roles, staffMembers, type Database } from "@azadimart/database";
import { AppError, STAFF_PERMISSION_KEYS, isStaffPermission, type StaffPermission } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { requireAudience } from "./guards";
import { getSessionPrincipal } from "./session";
import type { SessionPrincipal } from "./guards";

export type StaffAccess = {
  userId: string;
  role: SessionPrincipal["role"];
  /** Areas this person may use. */
  permissions: StaffPermission[];
  roleName: string;
  roleId: string | null;
  displayName: string | null;
  /** Owner or an existing admin without a team role: every area. */
  fullAccess: boolean;
};

/**
 * What a signed-in admin-portal user may do. The owner (SUPER_ADMIN) has every
 * area. Team members have their role's areas. Admins added before team roles
 * existed keep full access until they are given a role; support agents from
 * before keep the Support desk.
 */
export async function getStaffAccess(db: Database, principal: SessionPrincipal): Promise<StaffAccess> {
  const base = { userId: principal.userId, role: principal.role };
  if (principal.role === "SUPER_ADMIN") return { ...base, permissions: [...STAFF_PERMISSION_KEYS], roleName: "Owner", roleId: null, displayName: null, fullAccess: true };
  const member = (await db.select({ displayName: staffMembers.displayName, isActive: staffMembers.isActive, roleId: roles.id, roleName: roles.name, permissions: roles.permissions })
    .from(staffMembers).innerJoin(roles, eq(roles.id, staffMembers.roleId)).where(eq(staffMembers.userId, principal.userId)).limit(1))[0];
  if (member) {
    if (!member.isActive) throw new AppError("FORBIDDEN", "Your access to the admin portal is switched off");
    const saved = member.permissions.filter(isStaffPermission);
    // Banners used to be part of "Online store"; roles saved before the Banner Studio keep that access.
    const permissions = saved.includes("storefront") && !saved.includes("banners") ? [...saved, "banners" as const] : saved;
    return { ...base, permissions, roleName: member.roleName, roleId: member.roleId, displayName: member.displayName, fullAccess: STAFF_PERMISSION_KEYS.every((p) => permissions.includes(p)) };
  }
  if (principal.role === "ADMIN") return { ...base, permissions: [...STAFF_PERMISSION_KEYS], roleName: "Admin (full access)", roleId: null, displayName: null, fullAccess: true };
  if (principal.role === "SUPPORT") return { ...base, permissions: ["support"], roleName: "Support agent", roleId: null, displayName: null, fullAccess: false };
  throw new AppError("FORBIDDEN", "This identity cannot access this application");
}

/**
 * Requires a signed-in admin-portal user with one of the given areas
 * ("any" = any team member). Use in every admin API route.
 */
export async function requireStaff(request: Request, need: StaffPermission | StaffPermission[] | "any", db: Database = createDatabase()): Promise<SessionPrincipal & StaffAccess> {
  const principal = requireAudience(await getSessionPrincipal(request, db), "admin");
  const access = await getStaffAccess(db, principal);
  const wanted = need === "any" ? [] : Array.isArray(need) ? need : [need];
  if (wanted.length && !wanted.some((p) => access.permissions.includes(p))) throw new AppError("FORBIDDEN", "Your role doesn't include this area");
  return { ...principal, ...access };
}
