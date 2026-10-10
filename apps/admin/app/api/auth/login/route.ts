import { protectedLogin, sessionCookie } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { loginSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const input = loginSchema.parse(await request.json());
    const result = await protectedLogin(createDatabase(), request, input, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const response = NextResponse.json({
      ok: true,
      userId: result.userId,
      role: result.role,
      audience: "admin",
    });
    response.headers.append("Set-Cookie", sessionCookie(result.token));
    return response;
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    const retryAfter = (body.error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    return NextResponse.json(body, { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined });
  }
}
