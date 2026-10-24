import { confirmPhoneVerification, requestPhoneVerification, requireApiAccess } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

/** Proves the shopper's mobile with a texted code: {} sends the code, { code } checks it. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code").optional() }).parse(await request.json().catch(() => ({})));
    const db = createDatabase();
    if (!code) return NextResponse.json({ ok: true, ...(await requestPhoneVerification(db, request, session.userId)) });
    await confirmPhoneVerification(db, request, session.userId, code);
    return NextResponse.json({ ok: true, verified: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
