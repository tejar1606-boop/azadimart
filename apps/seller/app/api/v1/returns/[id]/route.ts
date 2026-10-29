import { requireApiAccess } from "@azadimart/auth";
import { changeReturnStatus, createDatabase, returnItems, returns, sellers, type ReturnStatus } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { id } = await context.params;
    const db = createDatabase();
    const rows = await db.select({
      id: returns.id,
      orderId: returns.orderId,
      sellerId: returns.sellerId,
      status: returns.status,
      reason: returns.reason,
      createdAt: returns.createdAt,
      updatedAt: returns.updatedAt,
      orderItemId: returnItems.orderItemId,
      quantity: returnItems.quantity,
      itemReason: returnItems.reason,
    }).from(returns)
      .innerJoin(returnItems, eq(returnItems.returnId, returns.id))
      .where(and(eq(returns.id, id), eq(returns.sellerId, principal.sellerId)));
    return NextResponse.json({ items: rows });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { id: returnId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(returnId)) throw new AppError("VALIDATION_ERROR", "A valid return ID is required");

    const body = (await request.json().catch(() => ({}))) as { status?: string; notes?: string };
    const nextStatus = body.status?.trim().toUpperCase();
    if (!nextStatus || !["APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REJECTED"].includes(nextStatus)) {
      throw new AppError("VALIDATION_ERROR", "Invalid return status");
    }

    const db = createDatabase();
    const result = await db.transaction(async (tx) => {
      const seller = (await tx.select({ id: sellers.id, status: sellers.status })
        .from(sellers).where(and(eq(sellers.id, principal.sellerId!), eq(sellers.userId, principal.userId))).limit(1))[0];
      if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");
      return changeReturnStatus(tx, { returnId, next: nextStatus as ReturnStatus, actorUserId: principal.userId, sellerId: principal.sellerId!, notes: body.notes, by: "SELLER" });
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
