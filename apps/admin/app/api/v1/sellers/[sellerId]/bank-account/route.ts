import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, sellerBankAccounts } from "@azadimart/database";
import { notifySeller } from "@azadimart/notify";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Admin verifies (against the bank proof document) or rejects the seller's payout bank account. */
export async function POST(request: Request, { params }: { params: Promise<{ sellerId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { sellerId } = await params;
    if (!uuidSchema.safeParse(sellerId).success) throw new AppError("NOT_FOUND", "Seller not found");
    const { decision, reason } = (await request.json().catch(() => ({}))) as { decision?: string; reason?: string };
    if (decision !== "VERIFIED" && decision !== "REJECTED") throw new AppError("VALIDATION_ERROR", "Choose verify or reject");
    const note = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
    if (decision === "REJECTED" && note.length < 3) throw new AppError("VALIDATION_ERROR", "Tell the seller why the account was rejected");
    const db = createDatabase();
    const now = new Date();
    const [account] = await db.update(sellerBankAccounts).set({
      verificationStatus: decision, verifiedAt: decision === "VERIFIED" ? now : null, verifiedByUserId: principal.userId,
      rejectionReason: decision === "REJECTED" ? note : null, updatedAt: now,
    }).where(and(eq(sellerBankAccounts.sellerId, sellerId), eq(sellerBankAccounts.isPrimary, true))).returning({ id: sellerBankAccounts.id, last4: sellerBankAccounts.accountNumberLast4 });
    if (!account) throw new AppError("NOT_FOUND", "This seller hasn't added a bank account");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "BANK_ACCOUNT_" + decision, entityType: "seller", entityId: sellerId, metadata: { last4: account.last4, reason: note || null } });
    await notifySeller(db, { sellerId, kind: "PAYOUT_ON_HOLD", dedupeKey: `BANK:${account.id}:${decision}`, href: "/payouts",
      title: decision === "VERIFIED" ? `Bank account ending ${account.last4} verified` : `Bank account ending ${account.last4} rejected`,
      body: decision === "VERIFIED" ? "Payments will be sent to this account automatically." : `${note}. Add a correct account in Payments.` });
    return NextResponse.json({ ok: true, status: decision });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
