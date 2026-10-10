import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, customers, users } from "@azadimart/database";
import { eq } from "drizzle-orm";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const db = createDatabase();
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"], db);
    // Who is signed in, so the header can say so (and offer Sign out).
    const who = (await db.select({ email: users.email, fullName: customers.fullName }).from(users).leftJoin(customers, eq(customers.userId, users.id)).where(eq(users.id, session.userId)).limit(1))[0];
    return NextResponse.json(
      {
        ok: true,
        userId: session.userId,
        role: session.role,
        audience: "storefront",
        customerId: session.customerId ?? null,
        email: who?.email ?? null,
        name: who?.fullName ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
