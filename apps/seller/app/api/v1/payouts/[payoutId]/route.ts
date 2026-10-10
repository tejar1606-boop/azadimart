import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, orderItems, orders, payoutItems, payouts, sellerCharges } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Order-by-order breakdown of one of the seller's own payouts. */
export async function GET(request: Request, { params }: { params: Promise<{ payoutId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { payoutId } = await params;
    if (!uuidSchema.safeParse(payoutId).success) throw new AppError("NOT_FOUND", "Payout not found");
    const db = createDatabase();
    const mine = await db.select({ id: payouts.id }).from(payouts).where(and(eq(payouts.id, payoutId), eq(payouts.sellerId, principal.sellerId))).limit(1);
    if (!mine.length) throw new AppError("NOT_FOUND", "Payout not found");
    const items = await db.select({
      orderNumber: orders.orderNumber, title: orderItems.title, quantity: payoutItems.quantity, grossPaise: payoutItems.grossAmountPaise,
      commissionRateBps: payoutItems.commissionRateBps, commissionPaise: payoutItems.commissionPaise, gstOnCommissionPaise: payoutItems.gstOnCommissionPaise,
      tcsPaise: payoutItems.tcsPaise, tdsPaise: payoutItems.tdsPaise, netPaise: payoutItems.netAmountPaise,
    }).from(payoutItems).innerJoin(orderItems, eq(orderItems.id, payoutItems.orderItemId)).innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(payoutItems.payoutId, payoutId));
    const charges = await db.select({ description: sellerCharges.description, amountPaise: sellerCharges.amountPaise }).from(sellerCharges).where(eq(sellerCharges.payoutId, payoutId));
    return NextResponse.json({ items, charges });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
