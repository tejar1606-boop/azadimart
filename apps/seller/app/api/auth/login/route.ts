import { loginUser, sessionCookie } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { loginSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const input = loginSchema.parse(await request.json());
    const result = await loginUser(createDatabase(), input.email, input.password, ["SELLER"]);
    const response = NextResponse.json({
      ok: true,
      userId: result.userId,
      role: result.role,
      audience: "seller",
    });
    response.headers.append("Set-Cookie", sessionCookie(result.token));
    return response;
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
