import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, invoices } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** One of the seller's own invoices or credit notes. */
export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { invoiceId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new AppError("NOT_FOUND", "Invoice not found");
    const row = (await createDatabase().select({ kind: invoices.kind, number: invoices.number, issuedAt: invoices.issuedAt, isTest: invoices.isTest, details: invoices.details })
      .from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.sellerId, principal.sellerId))).limit(1))[0];
    if (!row) throw new AppError("NOT_FOUND", "Invoice not found");
    return NextResponse.json({ invoice: row });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
