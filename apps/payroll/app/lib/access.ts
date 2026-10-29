import { getSessionPrincipal, getStaffAccess, requireStaff, type StaffAccess } from "@azadimart/auth";
import { createDatabase, employees } from "@azadimart/database";
import { AppError } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

type Db = ReturnType<typeof createDatabase>;
/** Who is signed in to Payroll: HR (team members with the "payroll" area) and/or an employee (their own payslips). */
export type PayrollViewer = { userId: string; name: string; hr: StaffAccess | null; employeeId: string | null };
const PAYROLL_ROLES = ["ADMIN", "SUPER_ADMIN", "SUPPORT", "EMPLOYEE"];

export async function viewerFor(db: Db, request: Request): Promise<PayrollViewer | null> {
  const principal = await getSessionPrincipal(request, db).catch(() => null);
  if (!principal || !PAYROLL_ROLES.includes(principal.role)) return null;
  const staff = principal.role === "EMPLOYEE" ? null : await getStaffAccess(db, principal).catch(() => null);
  const hr = staff?.permissions.includes("payroll") ? staff : null;
  const employee = (await db.select({ id: employees.id, name: employees.fullName }).from(employees).where(eq(employees.userId, principal.userId)).limit(1))[0];
  if (!hr && !employee) return null;
  return { userId: principal.userId, name: staff?.displayName ?? employee?.name ?? "Team member", hr, employeeId: employee?.id ?? null };
}

/** Server pages. */
export async function currentViewer(db = createDatabase()) {
  const cookie = (await headers()).get("cookie");
  if (!cookie) return null;
  return viewerFor(db, new Request("http://azadimart.internal", { headers: { cookie } }));
}
export async function requireViewer(need: "hr" | "employee" | "any" = "any") {
  await headers(); // per-request page
  const db = createDatabase();
  const viewer = await currentViewer(db);
  if (!viewer) redirect("/login");
  if (need === "hr" && !viewer.hr) redirect("/my");
  if (need === "employee" && !viewer.employeeId) redirect("/payroll");
  return { db, viewer };
}

/** API: HR only (team members whose role includes Payroll). */
export const requireHr = (request: Request) => requireStaff(request, "payroll");
/** API: the signed-in employee's own record. */
export async function requireEmployee(request: Request, db: Db) {
  const viewer = await viewerFor(db, request);
  if (!viewer) throw new AppError("UNAUTHORIZED", "Please sign in again");
  if (!viewer.employeeId) throw new AppError("FORBIDDEN", "No employee record is linked to this account");
  return viewer as PayrollViewer & { employeeId: string };
}
