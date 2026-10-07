import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, orders, payments, refunds } from "@azadimart/database";
import { getPaymentProvider } from "@azadimart/payments";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

type RefundRequest = {
  paymentId: string;
  amountPaise: number;
  idempotencyKey: string;
  reason?: string;
  manual?: boolean;
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = (await request.json()) as RefundRequest;

    if (
      !input.paymentId ||
      !Number.isInteger(input.amountPaise) ||
      input.amountPaise <= 0 ||
      !input.idempotencyKey ||
      input.idempotencyKey.length > 200
    ) {
      throw new AppError("VALIDATION_ERROR", "paymentId, positive amountPaise and idempotencyKey are required");
    }

    const db = createDatabase();

    const prepared = await db.transaction(async (tx) => {
      await tx.execute(sql\`
        select pg_advisory_xact_lock(
          hashtextextended(\${"refund:" + input.paymentId}, 0)
        )
      \`);

      const existing = (await tx.select().from(refunds)
        .where(eq(refunds.idempotencyKey, input.idempotencyKey))
        .limit(1))[0];

      if (existing) return { existing, reused: true as const };

      const payment = (await tx.select({
        id: payments.id,
        orderId: payments.orderId,
        provider: payments.provider,
        providerPaymentId: payments.providerPaymentId,
        status: payments.status,
        amountPaise: payments.amountPaise,
      }).from(payments).where(eq(payments.id, input.paymentId)).limit(1))[0];

      if (!payment) throw new AppError("NOT_FOUND", "Payment not found");

      const order = (await tx.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
      }).from(orders).where(eq(orders.id, payment.orderId)).limit(1))[0];
      if (!order) throw new AppError("NOT_FOUND", "Order not found");

      const completed = (await tx.select({
        amountPaise: sql<number>\`coalesce(sum(case when \${refunds.status} = 'COMPLETED' then \${refunds.amountPaise} else 0 end), 0)\`,
      }).from(refunds).where(eq(refunds.paymentId, payment.id)))[0]?.amountPaise ?? 0;

      if (input.amountPaise + Number(completed) > payment.amountPaise) {
        throw new AppError("CONFLICT", "Refund amount exceeds the remaining refundable payment amount");
      }

      if (payment.provider === "COD") {
        if (!input.manual) {
          throw new AppError("CONFLICT", "COD refunds require manual processing and cannot be sent to a PSP");
        }

        const row = (await tx.insert(refunds).values({
          paymentId: payment.id,
          orderId: order.id,
          amountPaise: input.amountPaise,
          status: "PENDING",
          idempotencyKey: input.idempotencyKey,
          reason: input.reason ?? null,
        }).returning())[0];

        await tx.insert(auditLogs).values({
          actorUserId: principal.userId,
          action: "REFUND_MANUAL_REQUESTED",
          entityType: "refund",
          entityId: row.id,
          metadata: {
            orderNumber: order.orderNumber,
            paymentId: payment.id,
            amountPaise: input.amountPaise,
            reason: input.reason ?? null,
          },
        });

        return { existing: row, reused: false as const };
      }

      if (!payment.providerPaymentId) throw new AppError("CONFLICT", "Payment has no provider payment ID");
      if (payment.status !== "CAPTURED" && payment.status !== "PARTIALLY_REFUNDED") {
        throw new AppError("CONFLICT", "Only captured payments can be refunded");
      }

      const row = (await tx.insert(refunds).values({
        paymentId: payment.id,
        orderId: order.id,
        amountPaise: input.amountPaise,
        status: "PROCESSING",
        idempotencyKey: input.idempotencyKey,
        reason: input.reason ?? null,
      }).returning())[0];

      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: "REFUND_PROCESSING",
        entityType: "refund",
        entityId: row.id,
        metadata: {
          orderNumber: order.orderNumber,
          paymentId: payment.id,
          amountPaise: input.amountPaise,
        },
      });

      return {
        existing: row,
        reused: false as const,
        provider: payment.provider,
        providerPaymentId: payment.providerPaymentId,
        paymentAmountPaise: payment.amountPaise,
      };
    });

    if (prepared.reused) {
      return NextResponse.json({ ok: true, refund: prepared.existing, idempotent: true });
    }

    if (!("provider" in prepared)) {
      return NextResponse.json(
        { ok: true, refund: prepared.existing, status: "PENDING", manual: true },
        { status: 202 },
      );
    }

    try {
      const provider = getPaymentProvider(prepared.provider);
      const result = await provider.refund(prepared.providerPaymentId, prepared.existing.amountPaise);

      const completed = await db.transaction(async (tx) => {
        await tx.execute(sql\`
          select pg_advisory_xact_lock(
            hashtextextended(\${"refund:" + prepared.existing.paymentId}, 0)
          )
        \`);

        const updated = (await tx.update(refunds).set({
          status: "COMPLETED",
          providerRefundId: result.providerRefundId,
          updatedAt: new Date(),
        }).where(and(eq(refunds.id, prepared.existing.id), eq(refunds.status, "PROCESSING"))).returning())[0];

        if (!updated) throw new AppError("CONFLICT", "Refund state changed before provider completion");

        const completedTotal = (await tx.select({
          amountPaise: sql<number>\`coalesce(sum(case when \${refunds.status} = 'COMPLETED' then \${refunds.amountPaise} else 0 end), 0)\`,
        }).from(refunds).where(eq(refunds.paymentId, prepared.existing.paymentId)))[0]?.amountPaise ?? 0;

        const nextPaymentStatus = Number(completedTotal) >= prepared.paymentAmountPaise
          ? "REFUNDED"
          : "PARTIALLY_REFUNDED";

        await tx.update(payments).set({
          status: nextPaymentStatus,
          updatedAt: new Date(),
        }).where(eq(payments.id, prepared.existing.paymentId));

        await tx.insert(auditLogs).values({
          actorUserId: principal.userId,
          action: "REFUND_COMPLETED",
          entityType: "refund",
          entityId: updated.id,
          metadata: {
            provider: prepared.provider,
            providerRefundId: result.providerRefundId,
            amountPaise: updated.amountPaise,
          },
        });

        return updated;
      });

      return NextResponse.json({ ok: true, refund: completed });
    } catch (error) {
      await db.update(refunds).set({
        status: "FAILED",
        updatedAt: new Date(),
      }).where(and(eq(refunds.id, prepared.existing.id), eq(refunds.status, "PROCESSING")));

      if (error instanceof AppError) throw error;
      throw new AppError("CONFLICT", "Payment provider rejected the refund request");
    }
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
