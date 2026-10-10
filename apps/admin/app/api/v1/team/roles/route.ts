import { requireStaff } from "@azadimart/auth";
import { auditLogs, createDatabase, roles } from "@azadimart/database";
import { AppError, staffRoleSchema, toApiError } from "@azadimart/shared";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertWithin } from "../team";

export const dynamic = "force-dynamic";

/** Creates a custom role from a set of areas. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const db = createDatabase();
    const me = await requireStaff(request, "team", db);
    const input = staffRoleSchema.parse(await request.json());
    assertWithin(me, input.permissions, "create a role");
    if ((await db.select({ id: roles.id }).from(roles).where(sql`lower(${roles.name}) = lower(${input.name})`).limit(1))[0]) throw new AppError("CONFLICT", "A role with this name already exists");
    const [role] = await db.insert(roles).values({ name: input.name, description: input.description, permissions: [...new Set(input.permissions)] }).returning();
    await db.insert(auditLogs).values({ actorUserId: me.userId, action: "TEAM_ROLE_CREATED", entityType: "role", entityId: role!.id, metadata: input });
    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
