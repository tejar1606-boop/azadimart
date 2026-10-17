import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, sellerAadhaar, sellers } from "@azadimart/database";
import { AppError, maskAadhaar } from "@azadimart/shared";
import { eq } from "drizzle-orm";

export async function aadhaarContext(request: Request) {
  const principal = await requireApiAccess(request, "seller", ["SELLER"]);
  if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
  const db = createDatabase();
  const [seller, record] = await Promise.all([
    db.select({ id: sellers.id, status: sellers.status, legalName: sellers.legalName }).from(sellers).where(eq(sellers.id, principal.sellerId)).limit(1).then((r) => r[0]),
    db.select().from(sellerAadhaar).where(eq(sellerAadhaar.sellerId, principal.sellerId)).limit(1).then((r) => r[0]),
  ]);
  if (!seller) throw new AppError("NOT_FOUND", "Seller profile not found");
  return { principal, db, seller, record };
}

/** What the seller (and the KYC page) may see: never more than the last 4 digits. */
export function publicAadhaar(record: typeof sellerAadhaar.$inferSelect | undefined) {
  if (!record) return { status: "NOT_STARTED" as const };
  return {
    status: record.status,
    masked: maskAadhaar(record.last4),
    nameOnAadhaar: record.status === "VERIFIED" ? record.nameOnAadhaar : null,
    verifiedAt: record.verifiedAt,
    otpExpiresAt: record.status === "OTP_SENT" ? record.otpExpiresAt : null,
    testMode: record.provider === "sandbox",
  };
}
