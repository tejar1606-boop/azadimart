import { encryptSecret, enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, sellerBankAccounts, sellers } from "@azadimart/database";
import { AppError, sellerBankAccountSchema, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Adds (or replaces) the bank account payouts go to. The number is stored
 * encrypted; only the last 4 digits are ever shown. A new account must be
 * verified by AzadiMart before money is sent to it.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const sellerId = principal.sellerId;
    const input = sellerBankAccountSchema.parse(await request.json().catch(() => ({})));
    const db = createDatabase();
    await enforceRateLimit(db, request, "bankAccount", { subject: principal.userId, rule: { limit: 5, windowSeconds: 24 * 60 * 60 } });
    const seller = (await db.select({ status: sellers.status }).from(sellers).where(eq(sellers.id, sellerId)).limit(1))[0];
    if (!seller || seller.status === "SUSPENDED") throw new AppError("FORBIDDEN", "Bank details can't be changed for this account");
    const last4 = input.accountNumber.slice(-4);
    const encrypted = encryptSecret(input.accountNumber);
    await db.transaction(async (tx) => {
      await tx.update(sellerBankAccounts).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(sellerBankAccounts.sellerId, sellerId), eq(sellerBankAccounts.isPrimary, true)));
      await tx.insert(sellerBankAccounts).values({ sellerId, accountHolderName: input.accountHolderName, accountNumberLast4: last4, accountNumberEncrypted: encrypted, ifsc: input.ifsc, isPrimary: true, verificationStatus: "PENDING" });
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "BANK_ACCOUNT_ADDED", entityType: "seller", entityId: sellerId, metadata: { last4, ifsc: input.ifsc } });
    });
    return NextResponse.json({ ok: true, bankAccount: { accountHolderName: input.accountHolderName, last4, ifsc: input.ifsc, status: "PENDING", rejectionReason: null } }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
