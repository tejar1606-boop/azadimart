import { getSessionPrincipal, getStaffAccess, type StaffAccess } from "@azadimart/auth";
import { adCampaigns, createDatabase } from "@azadimart/database";
import { count, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** The signed-in team member, if their role includes the Banner Studio. */
export async function currentStudioUser(db = createDatabase()): Promise<StaffAccess | null> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;
  const principal = await getSessionPrincipal(new Request("http://azadimart.internal", { headers: { cookie } }), db).catch(() => null);
  if (!principal || !["ADMIN", "SUPER_ADMIN", "SUPPORT"].includes(principal.role)) return null;
  const access = await getStaffAccess(db, principal).catch(() => null);
  return access?.permissions.includes("banners") ? access : null;
}

/** Server pages: sign in first. */
export async function requireStudioPage() {
  await headers(); // per-request page: never pre-rendered at build time
  const db = createDatabase();
  const access = await currentStudioUser(db);
  if (!access) redirect("/login");
  return { db, access };
}

/** Seller ads waiting for a decision (sidebar badge). */
export async function pendingAdCount(db = createDatabase()) {
  return Number((await db.select({ n: count() }).from(adCampaigns).where(eq(adCampaigns.status, "PENDING_REVIEW")))[0]?.n ?? 0);
}
