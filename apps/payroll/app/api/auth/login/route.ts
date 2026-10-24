import { protectedLogin, revokeSession, sessionCookie } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { AppError, loginSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { viewerFor } from "../../../lib/access";

/** HR (team members with Payroll) and employees (their own payslips) sign in here. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = loginSchema.parse(await request.json());
    const db = createDatabase();
    const result = await protectedLogin(db, request, input, "admin", ["ADMIN", "SUPER_ADMIN", "SUPPORT", "EMPLOYEE"]);
    const viewer = await viewerFor(db, new Request(request.url, { headers: { cookie: sessionCookie(result.token).split(";")[0]! } }));
    if (!viewer) {
      await revokeSession(db, result.token);
      throw new AppError("FORBIDDEN", "This account has no payslips and no Payroll access. Ask HR to link your employee record.");
    }
    const response = NextResponse.json({ ok: true, home: viewer.hr ? "/payroll" : "/my", audience: "payroll" });
    response.headers.append("Set-Cookie", sessionCookie(result.token));
    return response;
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    const retryAfter = (body.error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    return NextResponse.json(body, { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined });
  }
}
