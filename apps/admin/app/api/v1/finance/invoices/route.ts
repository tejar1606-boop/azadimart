import { requireStaff } from "@azadimart/auth";
import { createDatabase, invoices, orders, sellers } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Latest invoices, bills of supply and credit notes; search by number, order number or seller. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "payments");
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";
    const kind = url.searchParams.get("kind");
    const db = createDatabase();
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const where = and(
      q ? or(ilike(invoices.number, like), ilike(orders.orderNumber, like), ilike(sellers.storeName, like), ilike(sellers.legalName, like)) : undefined,
      kind && ["TAX_INVOICE", "BILL_OF_SUPPLY", "CREDIT_NOTE"].includes(kind) ? eq(invoices.kind, kind as "TAX_INVOICE") : undefined,
    );
    const items = await db.select({
      id: invoices.id, kind: invoices.kind, number: invoices.number, issuedAt: invoices.issuedAt, isTest: invoices.isTest,
      taxablePaise: invoices.taxablePaise, taxPaise: sql<number>`${invoices.cgstPaise} + ${invoices.sgstPaise} + ${invoices.igstPaise}`.mapWith(Number), totalPaise: invoices.totalPaise,
      orderNumber: orders.orderNumber, storeName: sellers.storeName, buyer: sql<string>`${invoices.details}->'buyer'->>'name'`,
    }).from(invoices).innerJoin(orders, eq(orders.id, invoices.orderId)).innerJoin(sellers, eq(sellers.id, invoices.sellerId))
      .where(where).orderBy(desc(invoices.issuedAt)).limit(200);
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
