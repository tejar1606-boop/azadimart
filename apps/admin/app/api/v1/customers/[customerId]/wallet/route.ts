import { requireStaff } from "@azadimart/auth";
import { addWalletCredit, auditLogs, createDatabase, customers, orders } from "@azadimart/database";
import { AppError, toApiError, uuidSchema, walletCreditSchema } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Add money to a shopper's LOIMART wallet (e.g. goodwill for a late or damaged
 * order). Needs the Payments permission. The shopper sees the reason, and can
 * use all of it on one order: it isn't limited like the welcome bonus.
 */
export async function POST(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "payments");
    const { customerId } = await params;
    if (!uuidSchema.safeParse(customerId).success) throw new AppError("NOT_FOUND", "Customer not found");
    const input = walletCreditSchema.parse(await request.json().catch(() => ({})));
    const db = createDatabase();
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer) throw new AppError("NOT_FOUND", "Customer not found");
    let orderId: string | null = null;
    if (input.orderNumber) {
      const [order] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.orderNumber, input.orderNumber.toUpperCase()), eq(orders.customerId, customerId))).limit(1);
      if (!order) throw new AppError("VALIDATION_ERROR", "That order number isn't one of this customer's orders");
      orderId = order.id;
    }
    const entry = await db.transaction(async (tx) => {
      const e = await addWalletCredit(tx, { customerId, amountPaise: input.amountPaise, reason: input.reason, orderId, expiryDays: input.expiryDays, actorUserId: principal.userId });
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "CUSTOMER_WALLET_CREDITED", entityType: "customer", entityId: customerId, metadata: { amountPaise: input.amountPaise, reason: input.reason, orderNumber: input.orderNumber || null, expiryDays: input.expiryDays, entryId: e.id } });
      return e;
    });
    return NextResponse.json({ ok: true, entry: { id: entry.id, amountPaise: entry.amountPaise, expiresAt: entry.expiresAt } }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
