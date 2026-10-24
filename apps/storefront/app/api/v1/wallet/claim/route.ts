import { enforceRateLimit, getClientIp, requireApiAccess } from "@azadimart/auth";
import { auditLogs, claimSignupBonus, createDatabase } from "@azadimart/database";
import { AppError, deviceSignalSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Claims the welcome bonus (verified mobile + device signals). Same answer shape whether granted or refused. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const db = createDatabase();
    await enforceRateLimit(db, request, "otpVerify", { subject: "bonus:" + session.userId });
    const signals = deviceSignalSchema.parse(await request.json().catch(() => ({})));
    const ip = getClientIp(request);
    const cookieId = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)loi_did=([A-Za-z0-9_-]{16,64})/)?.[1];
    const result = await claimSignupBonus(db, {
      customerId: session.customerId, deviceId: signals.deviceId ?? cookieId ?? null, fingerprint: signals.fingerprint ?? null,
      ipAddress: ip === "unknown" ? null : ip, userAgent: request.headers.get("user-agent"),
    });
    await db.insert(auditLogs).values({ actorUserId: session.userId, action: result.granted ? "WALLET_BONUS_GRANTED" : "WALLET_BONUS_REFUSED", entityType: "customer", entityId: session.customerId, metadata: { reason: result.reason } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
