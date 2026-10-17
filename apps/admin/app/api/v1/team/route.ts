import { requireStaff } from "@azadimart/auth";
import { createDatabase, roles } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureDefaultRoles, roleMemberCounts, teamMembers } from "./team";

export const dynamic = "force-dynamic";

/** Team members and roles for the Team & roles page. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    const me = await requireStaff(request, "team", db);
    await ensureDefaultRoles(db);
    const [members, roleRows, counts] = await Promise.all([teamMembers(db), db.select().from(roles).orderBy(asc(roles.createdAt)), roleMemberCounts(db)]);
    return NextResponse.json({
      me: { userId: me.userId, permissions: me.permissions, fullAccess: me.fullAccess },
      members,
      roles: roleRows.map((r) => ({ id: r.id, name: r.name, description: r.description ?? "", permissions: r.permissions, isSystem: r.isSystem, members: counts.get(r.id) ?? 0 })),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
