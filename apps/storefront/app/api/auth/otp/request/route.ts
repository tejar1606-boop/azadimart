import { isOtpLoginAvailable, requestLoginOtp } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { otpRequestSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Whether OTP login can be offered (an SMS provider is configured). */
export async function GET() {
  return NextResponse.json({ available: isOtpLoginAvailable() });
}

/** Sends a login code to a registered mobile number. Same reply whether or not the number has an account. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = otpRequestSchema.parse(await request.json());
    const result = await requestLoginOtp(createDatabase(), request, input.phone, "storefront", ["CUSTOMER"]);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    const retryAfter = (body.error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    return NextResponse.json(body, { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined });
  }
}
