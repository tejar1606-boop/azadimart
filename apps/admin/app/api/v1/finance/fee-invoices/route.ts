import { requireStaff } from "@azadimart/auth";
import { createDatabase, feeInvoices, sellers } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { desc, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";

/** LOIMART's fee invoices to sellers (its own sales: report in LOIMART's GSTR-1). */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "payments");
    const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const items = await createDatabase().select({
      id: feeInvoices.id, kind: feeInvoices.kind, number: feeInvoices.number, issuedAt: feeInvoices.issuedAt, isTest: feeInvoices.isTest, storeName: sellers.storeName, gstin: sellers.gstin,
      taxablePaise: feeInvoices.taxablePaise, cgstPaise: feeInvoices.cgstPaise, sgstPaise: feeInvoices.sgstPaise, igstPaise: feeInvoices.igstPaise, totalPaise: feeInvoices.totalPaise,
    }).from(feeInvoices).innerJoin(sellers, eq(sellers.id, feeInvoices.sellerId))
      .where(q ? or(ilike(feeInvoices.number, like), ilike(sellers.storeName, like), ilike(sellers.legalName, like)) : undefined)
      .orderBy(desc(feeInvoices.issuedAt)).limit(300);
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
