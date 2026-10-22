import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, feeInvoices } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** One of LOIMART's fee invoices to this seller. */
export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const { invoiceId } = await params;
    if (!uuidSchema.safeParse(invoiceId).success) throw new AppError("NOT_FOUND", "Invoice not found");
    const row = (await createDatabase().select({ number: feeInvoices.number, issuedAt: feeInvoices.issuedAt, isTest: feeInvoices.isTest, details: feeInvoices.details })
      .from(feeInvoices).where(and(eq(feeInvoices.id, invoiceId), eq(feeInvoices.sellerId, principal.sellerId))).limit(1))[0];
    if (!row) throw new AppError("NOT_FOUND", "Invoice not found");
    return NextResponse.json({ invoice: row });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
