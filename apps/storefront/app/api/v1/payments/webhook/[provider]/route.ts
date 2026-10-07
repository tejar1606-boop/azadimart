import { createDatabase, orders, paymentEvents, payments } from "@azadimart/database";
import { getPaymentProvider, type PaymentProviderCode } from "@azadimart/payments";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const providers = new Set<PaymentProviderCode>(["RAZORPAY", "CASHFREE", "COD"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { provider: rawProvider } = await context.params;
    const provider = rawProvider.toUpperCase() as PaymentProviderCode;
    if (!providers.has(provider)) throw new AppError("VALIDATION_ERROR", "Unsupported payment provider");

    const body = await request.json();
    const paymentProvider = getPaymentProvider(provider);
    const event = await paymentProvider.parseWebhook(request.headers, body);
    const db = createDatabase();

    const result = await db.transaction(async (tx) => {
      const inserted = await tx.insert(paymentEvents).values({
        provider: event.provider,
        eventId: event.eventId,
        eventType: event.status,
        payload: event.raw,
        processedAt: new Date(),
      }).returning({ id: paymentEvents.id });

      const payment = (await tx.select({
        id: payments.id,
        orderId: payments.orderId,
        status: payments.status,
      }).from(payments).where(and(
        eq(payments.provider, event.provider),
        eq(payments.providerPaymentId, event.providerPaymentId),
      )).limit(1))[0];

      if (!payment) {
        throw new AppError("NOT_FOUND", "Payment record not found");
      }

      const nextPaymentStatus =
        event.status === "CAPTURED" ? "CAPTURED" :
        event.status === "FAILED" ? "FAILED" : "REFUNDED";

      await tx.update(payments).set({
        status: nextPaymentStatus,
        updatedAt: new Date(),
      }).where(eq(payments.id, payment.id));

      if (event.status === "CAPTURED") {
        await tx.update(orders).set({ status: "PAID", updatedAt: new Date() })
          .where(and(eq(orders.id, payment.orderId), eq(orders.status, "PAYMENT_PENDING")));
      }

      return { paymentId: payment.id, orderId: payment.orderId, status: nextPaymentStatus, eventId: inserted[0]?.id };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
