import { getSessionPrincipal, getStaffAccess, type StaffAccess } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { firstAdminPage, type StaffPermission } from "@azadimart/shared";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** The signed-in team member's access, or null (not signed in / not staff / switched off). */
export async function currentStaff(db = createDatabase()): Promise<StaffAccess | null> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;
  const principal = await getSessionPrincipal(new Request("http://azadimart.internal", { headers: { cookie } }), db).catch(() => null);
  if (!principal || !["ADMIN", "SUPER_ADMIN", "SUPPORT"].includes(principal.role)) return null;
  return getStaffAccess(db, principal).catch(() => null);
}

/** Server pages: sign in first; without this area, go to the first page the role allows. */
export async function requireStaffPage(permission: StaffPermission) {
  await headers(); // per-request page: never pre-rendered at build time
  const db = createDatabase();
  const access = await currentStaff(db);
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect(firstAdminPage(access.permissions));
  return { db, access };
}
