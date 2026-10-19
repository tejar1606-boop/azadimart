import { getStaffAccess, protectedLogin, revokeSession, sessionCookie } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { AppError, loginSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const input = loginSchema.parse(await request.json());
    const db = createDatabase();
    const result = await protectedLogin(db, request, input, "admin", ["ADMIN", "SUPER_ADMIN", "SUPPORT"]);
    // Only team members whose role includes the Banner Studio may stay signed in here.
    const access = await getStaffAccess(db, { userId: result.userId, role: result.role }).catch(() => null);
    if (!access?.permissions.includes("banners")) {
      await revokeSession(db, result.token);
      throw new AppError("FORBIDDEN", "Your role doesn't include the Banner Studio. Ask the owner to add it in Admin → Team & roles.");
    }
    const response = NextResponse.json({
      ok: true,
      userId: result.userId,
      role: result.role,
      audience: "studio",
    });
    response.headers.append("Set-Cookie", sessionCookie(result.token));
    return response;
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    const retryAfter = (body.error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    return NextResponse.json(body, { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined });
  }
}
