import { hashPassword, requireStaff } from "@azadimart/auth";
import { auditLogs, createDatabase, roles, staffMembers, users } from "@azadimart/database";
import { AppError, staffMemberCreateSchema, toApiError } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertWithin } from "../team";

export const dynamic = "force-dynamic";

/** Adds a team member with their own sign-in and a role. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    const me = await requireStaff(request, "team", db);
    const input = staffMemberCreateSchema.parse(await request.json());
    const role = (await db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1))[0];
    if (!role) throw new AppError("VALIDATION_ERROR", "Choose a role");
    assertWithin(me, role.permissions, "give a role");
    if ((await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1))[0]) throw new AppError("CONFLICT", "Someone already uses this email");
    const [user] = await db.insert(users).values({ email: input.email, passwordHash: await hashPassword(input.password), role: "ADMIN", status: "ACTIVE" }).returning({ id: users.id });
    await db.insert(staffMembers).values({ userId: user!.id, displayName: input.displayName, roleId: role.id, createdByUserId: me.userId });
    await db.insert(auditLogs).values({ actorUserId: me.userId, action: "TEAM_MEMBER_ADDED", entityType: "user", entityId: user!.id, metadata: { email: input.email, role: role.name } });
    return NextResponse.json({ member: { userId: user!.id, email: input.email, name: input.displayName, roleName: role.name } }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
