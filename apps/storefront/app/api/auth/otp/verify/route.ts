import { sessionCookie, verifyLoginOtp } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { otpVerifySchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Checks the SMS code and signs in, exactly like a password login. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = otpVerifySchema.parse(await request.json());
    const result = await verifyLoginOtp(createDatabase(), request, input.phone, input.code, "storefront", ["CUSTOMER"]);
    const response = NextResponse.json({ ok: true, userId: result.userId, role: result.role, audience: "storefront" });
    response.headers.append("Set-Cookie", sessionCookie(result.token));
    return response;
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    const retryAfter = (body.error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    return NextResponse.json(body, { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined });
  }
}
