import { enforceRateLimit } from "@azadimart/auth";
import { auditLogs, sellerAadhaar } from "@azadimart/database";
import { AppError, aadhaarOtpVerifySchema, toApiError } from "@azadimart/shared";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { aadhaarProvider } from "../../../../../lib/aadhaar";
import { aadhaarContext, publicAadhaar } from "../shared";

const MAX_ATTEMPTS = 3;

/** Checks the OTP with the provider; on success the owner's Aadhaar is verified. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { principal, db, seller, record } = await aadhaarContext(request);
    const { otp } = aadhaarOtpVerifySchema.parse(await request.json().catch(() => ({})));
    await enforceRateLimit(db, request, "aadhaarVerify", { subject: principal.userId, rule: { limit: 15, windowSeconds: 60 * 60 } });
    if (record?.status === "VERIFIED") throw new AppError("CONFLICT", "Aadhaar is already verified");
    if (record?.status !== "OTP_SENT" || !record.providerRef) throw new AppError("UNPROCESSABLE", "Request an OTP first");
    if (!record.otpExpiresAt || record.otpExpiresAt < new Date()) throw new AppError("UNPROCESSABLE", "This OTP has expired. Request a new one.");
    // Count the attempt first, atomically, so parallel guesses can't exceed the limit.
    const counted = (await db.update(sellerAadhaar).set({ otpAttempts: sql`${sellerAadhaar.otpAttempts} + 1`, updatedAt: new Date() })
      .where(and(eq(sellerAadhaar.sellerId, seller.id), eq(sellerAadhaar.status, "OTP_SENT"), sql`${sellerAadhaar.otpAttempts} < ${MAX_ATTEMPTS}`)).returning())[0];
    if (!counted) throw new AppError("UNPROCESSABLE", "Too many wrong OTPs. Request a new one.");

    const details = await aadhaarProvider(seller.legalName).verifyOtp(record.providerRef, otp);
    if (!details) {
      const left = MAX_ATTEMPTS - counted.otpAttempts;
      throw new AppError("VALIDATION_ERROR", left > 0 ? `That OTP is incorrect. ${left} attempt${left === 1 ? "" : "s"} left.` : "That OTP is incorrect. Request a new one.");
    }
    const now = new Date();
    const [saved] = await db.update(sellerAadhaar).set({ status: "VERIFIED", nameOnAadhaar: details.name.slice(0, 120), yearOfBirth: details.yearOfBirth, stateOnAadhaar: details.state, verifiedAt: now, otpExpiresAt: null, updatedAt: now })
      .where(eq(sellerAadhaar.sellerId, seller.id)).returning();
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "AADHAAR_VERIFIED", entityType: "seller", entityId: seller.id, metadata: { last4: record.last4, provider: record.provider } });
    return NextResponse.json({ ok: true, aadhaar: publicAadhaar(saved) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
