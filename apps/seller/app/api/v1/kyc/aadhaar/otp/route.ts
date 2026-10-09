import { enforceRateLimit } from "@azadimart/auth";
import { auditLogs, sellerAadhaar } from "@azadimart/database";
import { AppError, aadhaarOtpRequestSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { aadhaarProvider } from "../../../../../lib/aadhaar";
import { aadhaarContext, publicAadhaar } from "../shared";

const OTP_MINUTES = 10;

/** Sends an OTP to the mobile linked to the owner's Aadhaar. The number itself is never stored. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { principal, db, seller, record } = await aadhaarContext(request);
    const input = aadhaarOtpRequestSchema.parse(await request.json().catch(() => ({})));
    if (seller.status === "SUSPENDED") throw new AppError("FORBIDDEN", "Your seller account is suspended");
    if (record?.status === "VERIFIED") throw new AppError("CONFLICT", "Aadhaar is already verified. Contact seller support to change it.");
    await enforceRateLimit(db, request, "aadhaarOtp", { subject: principal.userId, rule: { limit: 5, windowSeconds: 60 * 60 } });

    const provider = aadhaarProvider(seller.legalName);
    const { ref } = await provider.sendOtp(input.aadhaarNumber);
    const now = new Date();
    const values = { status: "OTP_SENT" as const, last4: input.aadhaarNumber.slice(-4), provider: provider.name, providerRef: ref, otpExpiresAt: new Date(now.getTime() + OTP_MINUTES * 60_000), otpAttempts: 0, consentAt: now, nameOnAadhaar: null, yearOfBirth: null, stateOnAadhaar: null, verifiedAt: null, updatedAt: now };
    const [saved] = await db.insert(sellerAadhaar).values({ sellerId: seller.id, ...values })
      .onConflictDoUpdate({ target: sellerAadhaar.sellerId, set: values }).returning();
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "AADHAAR_OTP_SENT", entityType: "seller", entityId: seller.id, metadata: { last4: values.last4, provider: provider.name, consent: true } });
    return NextResponse.json({ ok: true, aadhaar: publicAadhaar(saved) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
