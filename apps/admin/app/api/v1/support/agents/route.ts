import { requireApiAccess, hashPassword } from "@azadimart/auth";
import { auditLogs, createDatabase, supportAgents, supportTickets, users } from "@azadimart/database";
import { AppError, supportAgentCreateSchema, toApiError } from "@azadimart/shared";
import { count, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSupportStaff } from "../staff";

export const dynamic = "force-dynamic";

/** The support team: admins and support agents, with their open ticket load. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, role } = await requireSupportStaff(request);
    const rows = await db.select({ userId: users.id, email: users.email, role: users.role, status: users.status, lastLoginAt: users.lastLoginAt, displayName: supportAgents.displayName, isActive: supportAgents.isActive })
      .from(users).leftJoin(supportAgents, eq(supportAgents.userId, users.id)).where(inArray(users.role, ["ADMIN", "SUPER_ADMIN", "SUPPORT"]));
    const load = await db.select({ userId: supportTickets.assignedToUserId, n: count() }).from(supportTickets).where(inArray(supportTickets.status, ["OPEN", "IN_PROGRESS", "WAITING"])).groupBy(supportTickets.assignedToUserId);
    return NextResponse.json({
      canManage: role !== "SUPPORT",
      items: rows.map((r) => ({ ...r, name: r.displayName || r.email.split("@")[0] || r.email, isActive: r.status === "ACTIVE" && r.isActive !== false, openTickets: Number(load.find((l) => l.userId === r.userId)?.n ?? 0) }))
        .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Admins add a support agent: they can sign in to the admin portal but only use the Support desk. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    const input = supportAgentCreateSchema.parse(await request.json());
    if ((await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1))[0]) throw new AppError("CONFLICT", "Someone already uses this email");
    const [user] = await db.insert(users).values({ email: input.email, passwordHash: await hashPassword(input.password), role: "SUPPORT", status: "ACTIVE" }).returning({ id: users.id });
    await db.insert(supportAgents).values({ userId: user!.id, displayName: input.displayName });
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "SUPPORT_AGENT_CREATED", entityType: "user", entityId: user!.id, metadata: { email: input.email } });
    return NextResponse.json({ agent: { userId: user!.id, email: input.email, name: input.displayName } }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

