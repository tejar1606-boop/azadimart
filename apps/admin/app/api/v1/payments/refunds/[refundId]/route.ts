import { requireStaff } from "@azadimart/auth";
import { auditLogs, completeRefund, createDatabase, refunds, sendPendingRefund } from "@azadimart/database";
import { getPaymentProvider, type PaymentProviderCode } from "@azadimart/payments";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * A refund waiting to go back to the shopper's original payment method:
 * {action: "SEND"} retries the payment gateway; {action: "PAID", reference}
 * records it as paid by bank transfer/UPI with its UTR.
 */
export async function POST(request: Request, { params }: { params: Promise<{ refundId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "payments");
    const { refundId } = await params;
    if (!uuidSchema.safeParse(refundId).success) throw new AppError("NOT_FOUND", "Refund not found");
    const { action, reference } = (await request.json().catch(() => ({}))) as { action?: string; reference?: string };
    const db = createDatabase();
    const [refund] = await db.select({ id: refunds.id, status: refunds.status, amountPaise: refunds.amountPaise, orderId: refunds.orderId }).from(refunds).where(eq(refunds.id, refundId)).limit(1);
    if (!refund) throw new AppError("NOT_FOUND", "Refund not found");
    if (refund.status !== "PENDING") throw new AppError("CONFLICT", "Only a waiting refund can be sent or marked paid");

    if (action === "SEND") {
      const result = await sendPendingRefund(db, refundId, (code) => getPaymentProvider(code as PaymentProviderCode));
      if (!result.sent) throw new AppError("CONFLICT", "error" in result && result.error ? `The payment gateway refused it: ${result.error}` : "The payment gateway isn't set up yet. Pay it by bank transfer/UPI and mark it paid.");
      await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "REFUND_COMPLETED", entityType: "refund", entityId: refundId, metadata: { orderId: refund.orderId, amountPaise: refund.amountPaise, via: "GATEWAY" } });
      return NextResponse.json({ ok: true });
    }
    if (action === "PAID") {
      const ref = typeof reference === "string" ? reference.trim().slice(0, 60) : "";
      if (ref.length < 4) throw new AppError("VALIDATION_ERROR", "Enter the bank/UPI reference (UTR)");
      await completeRefund(db, refundId, `MANUAL:${ref}:${refundId.slice(0, 8)}`);
      await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "REFUND_COMPLETED", entityType: "refund", entityId: refundId, metadata: { orderId: refund.orderId, amountPaise: refund.amountPaise, via: "MANUAL", reference: ref } });
      return NextResponse.json({ ok: true });
    }
    throw new AppError("VALIDATION_ERROR", "Choose SEND or PAID");
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
