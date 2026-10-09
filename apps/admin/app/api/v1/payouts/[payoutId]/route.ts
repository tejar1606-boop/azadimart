import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, orderItems, orders, payoutItems, payouts } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { processPayout } from "../../../../lib/payouts";

type Params = { params: Promise<{ payoutId: string }> };

/** Order-by-order breakdown of a payout. */
export async function GET(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { payoutId } = await params;
    if (!uuidSchema.safeParse(payoutId).success) throw new AppError("NOT_FOUND", "Payout not found");
    const db = createDatabase();
    const items = await db.select({
      orderNumber: orders.orderNumber, title: orderItems.title, quantity: payoutItems.quantity, grossPaise: payoutItems.grossAmountPaise,
      commissionRateBps: payoutItems.commissionRateBps, commissionPaise: payoutItems.commissionPaise, gstOnCommissionPaise: payoutItems.gstOnCommissionPaise,
      tcsPaise: payoutItems.tcsPaise, tdsPaise: payoutItems.tdsPaise, netPaise: payoutItems.netAmountPaise,
    }).from(payoutItems).innerJoin(orderItems, eq(orderItems.id, payoutItems.orderItemId)).innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(payoutItems.payoutId, payoutId));
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** APPROVE (over the daily limit, or after repeated failures) or RETRY now. */
export async function POST(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { payoutId } = await params;
    if (!uuidSchema.safeParse(payoutId).success) throw new AppError("NOT_FOUND", "Payout not found");
    const { action } = (await request.json().catch(() => ({}))) as { action?: string };
    if (action !== "APPROVE" && action !== "RETRY") throw new AppError("VALIDATION_ERROR", "Choose approve or retry");
    const db = createDatabase();
    const payout = (await db.select({ status: payouts.status }).from(payouts).where(eq(payouts.id, payoutId)).limit(1))[0];
    if (!payout) throw new AppError("NOT_FOUND", "Payout not found");
    if (payout.status === "PAID" || payout.status === "PROCESSING") throw new AppError("CONFLICT", "This payout has already been sent");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: action === "APPROVE" ? "PAYOUT_APPROVED" : "PAYOUT_RETRIED", entityType: "payout", entityId: payoutId, metadata: {} });
    const outcome = await processPayout(db, payoutId, action === "APPROVE" ? { approvedByUserId: principal.userId } : {});
    const after = (await db.select({ status: payouts.status, failureReason: payouts.failureReason, utr: payouts.utr }).from(payouts).where(eq(payouts.id, payoutId)).limit(1))[0];
    return NextResponse.json({ ok: true, outcome, payout: after });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
