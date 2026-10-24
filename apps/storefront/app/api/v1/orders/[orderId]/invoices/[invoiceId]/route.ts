import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, invoices, orders } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** One invoice or credit note on the customer's own order. */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string; invoiceId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const { orderId, invoiceId } = await params;
    if (![orderId, invoiceId].every((id) => /^[0-9a-f-]{36}$/i.test(id))) throw new AppError("NOT_FOUND", "Invoice not found");
    const db = createDatabase();
    const row = (await db.select({ kind: invoices.kind, number: invoices.number, issuedAt: invoices.issuedAt, isTest: invoices.isTest, details: invoices.details })
      .from(invoices).innerJoin(orders, eq(orders.id, invoices.orderId))
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orderId, orderId), eq(orders.customerId, session.customerId))).limit(1))[0];
    if (!row) throw new AppError("NOT_FOUND", "Invoice not found");
    return NextResponse.json({ invoice: row });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
