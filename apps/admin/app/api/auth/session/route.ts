import { requireStaff } from "@azadimart/auth";
import { toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** The signed-in team member, their role and the areas they may use. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const session = await requireStaff(request, "any");
    return NextResponse.json(
      {
        ok: true,
        userId: session.userId,
        role: session.role,
        audience: "admin",
        roleName: session.roleName,
        permissions: session.permissions,
        fullAccess: session.fullAccess,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
