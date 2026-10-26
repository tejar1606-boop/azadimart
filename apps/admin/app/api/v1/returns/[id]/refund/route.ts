import { requireStaff } from "@azadimart/auth";
import { createDatabase, markReturnRefunded, payments, returnRefundQuote } from "@azadimart/database";
import { eq } from "drizzle-orm";
import { getPaymentProvider } from "@azadimart/payments";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** What the customer gets back for this return, and how they paid. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, ["orders", "payments"]);
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Return request not found");
    return NextResponse.json(await returnRefundQuote(createDatabase(), id), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/**
 * Refund a received return. GATEWAY: back to the card/UPI used to pay online.
 * MANUAL: LOIMART paid the customer by bank transfer or UPI (Cash on Delivery,
 * or the gateway isn't connected): record the UTR/reference.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "payments");
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Return request not found");
    const body = (await request.json().catch(() => ({}))) as { method?: string; reference?: string; amountPaise?: number };
    const db = createDatabase();
    const quote = await returnRefundQuote(db, id);
    if (quote.status !== "RECEIVED") throw new AppError("CONFLICT", quote.status === "REFUNDED" ? "This return is already refunded" : "Refund once the item is received back");
    const amount = body.amountPaise === undefined ? quote.toCustomerPaise : Number(body.amountPaise);
    if (!Number.isInteger(amount) || amount < 0) throw new AppError("VALIDATION_ERROR", "Enter a valid refund amount");
    if (amount > 0 && (!quote.payment || amount > quote.payment.refundablePaise)) throw new AppError("CONFLICT", "That's more than is left to refund on this order's payment");
    const reference = (body.reference ?? "").trim().slice(0, 100);

    let providerRefundId: string | null = null;
    if (body.method === "GATEWAY" && amount > 0) {
      const payment = quote.payment!;
      if (payment.method === "COD") throw new AppError("CONFLICT", "Cash on Delivery orders are refunded by bank transfer or UPI: choose 'Paid manually'");
      const provider = getPaymentProvider(payment.method);
      if (!provider.isConfigured) throw new AppError("CONFLICT", "The payment gateway isn't connected yet. Pay the customer by bank transfer or UPI and choose 'Paid manually'.");
      const [row] = await db.select({ providerPaymentId: payments.providerPaymentId }).from(payments).where(eq(payments.id, payment.id));
      if (!row?.providerPaymentId) throw new AppError("CONFLICT", "This payment has no gateway reference to refund");
      providerRefundId = (await provider.refund(row.providerPaymentId, amount, `return:${id}`)).providerRefundId;
    } else if (body.method === "MANUAL") {
      if (amount > 0 && reference.length < 4) throw new AppError("VALIDATION_ERROR", "Enter the UTR or UPI reference of the payment to the customer");
    } else if (amount > 0) {
      throw new AppError("VALIDATION_ERROR", "Choose how the refund is paid");
    }

    await db.transaction((tx) => markReturnRefunded(tx, {
      returnId: id, amountPaise: amount, toWalletPaise: quote.toWalletPaise, paymentId: quote.payment?.id ?? null,
      reference: providerRefundId ? `gateway ${providerRefundId}` : reference ? `paid manually, ref ${reference}` : "nothing to pay", providerRefundId, actorUserId: principal.userId,
    }));
    return NextResponse.json({ ok: true, refundedPaise: amount, toWalletPaise: quote.toWalletPaise });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
