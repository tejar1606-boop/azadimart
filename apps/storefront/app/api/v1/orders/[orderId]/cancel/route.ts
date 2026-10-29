import { requireApiAccess } from "@azadimart/auth";
import { cancelOrderInTransaction, createDatabase, orders, sendPendingRefund } from "@azadimart/database";
import { notifySellersOfCancellation } from "@azadimart/notify";
import { getPaymentProvider, type PaymentProviderCode } from "@azadimart/payments";
import { AppError, REFUND_DESTINATIONS, type RefundDestination, toApiError } from "@azadimart/shared";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!principal.customerId) {
      throw new AppError("UNAUTHORIZED", "Customer profile required");
    }

    const { orderId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      throw new AppError("VALIDATION_ERROR", "A valid order ID is required");
    }

    const body = (await request.json().catch(() => ({}))) as { reason?: string; refundTo?: string };
    const reason = body.reason?.trim().slice(0, 500) || "Cancelled by customer";
    // Paid online: the shopper chooses their LOIMART wallet (instant) or the original payment method.
    const refundTo: RefundDestination = REFUND_DESTINATIONS.includes(body.refundTo as RefundDestination) ? (body.refundTo as RefundDestination) : "SOURCE";

    const db = createDatabase();

    const result = await db.transaction(async (tx) => {
      // Serialize customer cancellation with seller shipment reservation for this
      // order. This prevents a cancellation and shipment creation from crossing
      // each other between their eligibility check and the state mutation.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orderId}, 0))`);

      const order = (
        await tx
          .select({
            id: orders.id,
            status: orders.status,
            couponCode: orders.couponCode,
          })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.customerId, principal.customerId!)))
          .limit(1)
      )[0];

      if (!order) {
        throw new AppError("NOT_FOUND", "Order not found");
      }

      if (order.status !== "CONFIRMED") {
        throw new AppError(
          "CONFLICT",
          "This order can no longer be cancelled",
        );
      }

      const { paymentStatus, refund } = await cancelOrderInTransaction(tx, {
        orderId: order.id,
        fromStatus: order.status,
        actorUserId: principal.userId,
        reason,
        referenceType: "ORDER_CANCELLATION",
        by: "CUSTOMER",
        refundTo,
      });

      return {
        orderId: order.id,
        status: "CANCELLED" as const,
        paymentStatus,
        refund,
      };
    });

    // A refund to the card/UPI/bank goes to the payment gateway now; if it can't, the Payments team sends it.
    if (result.refund?.status === "PENDING") {
      const sent = await sendPendingRefund(db, result.refund.id, (code) => getPaymentProvider(code as PaymentProviderCode)).catch(() => ({ sent: false as const }));
      if (sent.sent) result.refund = { ...result.refund, status: "COMPLETED" };
    }
    // Tell the sellers not to ship (after the transaction has committed).
    await notifySellersOfCancellation(db, result.orderId, "CUSTOMER", reason === "Cancelled by customer" ? null : reason);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
