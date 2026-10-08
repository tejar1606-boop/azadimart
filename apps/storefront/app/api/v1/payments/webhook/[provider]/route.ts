import { createDatabase, orders, paymentEvents, payments } from "@azadimart/database";
import { getPaymentProvider, type PaymentProviderCode } from "@azadimart/payments";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq, sql } from "drizzle-orm";
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
      await tx.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${event.provider + ":" + event.providerPaymentId}, 0)
        )
      `);

      const inserted = await tx.insert(paymentEvents).values({
        provider: event.provider,
        eventId: event.eventId,
        eventType: event.status,
        payload: event.raw,
        processedAt: new Date(),
      }).onConflictDoNothing({
        target: [paymentEvents.provider, paymentEvents.eventId],
      }).returning({ id: paymentEvents.id });

      if (!inserted.length) return { duplicate: true };

      const payment = (await tx.select({
        id: payments.id,
        orderId: payments.orderId,
        status: payments.status,
      }).from(payments).where(and(
        eq(payments.provider, event.provider),
        eq(payments.providerPaymentId, event.providerPaymentId),
      )).limit(1))[0];

      if (!payment) throw new AppError("NOT_FOUND", "Payment record not found");

      const shouldApply =
        payment.status === "PENDING" ||
        (payment.status === "FAILED" && event.status === "CAPTURED") ||
        (payment.status === "CAPTURED" && event.status === "REFUNDED");

      if (!shouldApply) {
        return {
          duplicate: false,
          ignored: true,
          paymentId: payment.id,
          orderId: payment.orderId,
          status: payment.status,
          eventId: inserted[0]?.id,
        };
      }

      const nextPaymentStatus =
        event.status === "CAPTURED" ? "CAPTURED" :
        event.status === "FAILED" ? "FAILED" : "REFUNDED";

      await tx.update(payments).set({
        status: nextPaymentStatus,
        updatedAt: new Date(),
      }).where(eq(payments.id, payment.id));

      if (event.status === "CAPTURED") {
        // A COD order may already be CONFIRMED, while online-payment orders
        // are expected to be PAYMENT_PENDING. In either case a verified
        // capture should transition the order to PAID.
        await tx.update(orders).set({ status: "PAID", updatedAt: new Date() })
          .where(and(
            eq(orders.id, payment.orderId),
            sql`${orders.status} IN ('PAYMENT_PENDING', 'CONFIRMED')`,
          ));
      }

      return {
        duplicate: false,
        ignored: false,
        paymentId: payment.id,
        orderId: payment.orderId,
        status: nextPaymentStatus,
        eventId: inserted[0]?.id,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
