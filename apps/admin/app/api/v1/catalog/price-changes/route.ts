import { requireStaff } from "@azadimart/auth";
import { createDatabase, productPriceHistory, products, sellers, users } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";

/**
 * Discount changes across all products, newest first: price, MRP and coupon
 * limit changes. Filters: days (7/30/90), show = all | mrp (MRP raised) |
 * big (70%+ off after the change) | coupon (coupon limit changes).
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, ["catalog", "marketing"]);
    const url = new URL(request.url);
    const days = [7, 30, 90].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 7;
    const show = url.searchParams.get("show") ?? "all";
    const h = productPriceHistory;
    const filters: SQL[] = [gte(h.createdAt, sql`now() - make_interval(days => ${days})`)];
    if (show === "mrp") filters.push(eq(h.mrpRaised, true));
    if (show === "coupon") filters.push(eq(h.kind, "COUPON_LIMIT"));
    if (show === "big") filters.push(sql`${h.kind} = 'PRICE' and ${h.mrpPaiseAfter} > 0 and (${h.mrpPaiseAfter} - ${h.pricePaiseAfter}) * 100 >= 70 * ${h.mrpPaiseAfter}`);
    const requester = alias(users, "requester"), approver = alias(users, "approver");
    const db = createDatabase();
    const items = await db.select({
      id: h.id, productId: h.productId, productTitle: products.title, productSlug: products.slug, storeName: sellers.storeName,
      kind: h.kind, sku: h.sku, variantTitle: h.variantTitle, pricePaiseBefore: h.pricePaiseBefore, pricePaiseAfter: h.pricePaiseAfter,
      mrpPaiseBefore: h.mrpPaiseBefore, mrpPaiseAfter: h.mrpPaiseAfter, couponPctBefore: h.couponPctBefore, couponPctAfter: h.couponPctAfter,
      source: h.source, mrpRaised: h.mrpRaised, createdAt: h.createdAt, requestedBy: requester.email, approvedBy: approver.email,
    }).from(h).innerJoin(products, eq(products.id, h.productId)).innerJoin(sellers, eq(sellers.id, products.sellerId))
      .leftJoin(requester, eq(requester.id, h.requestedByUserId)).leftJoin(approver, eq(approver.id, h.approvedByUserId))
      .where(and(...filters)).orderBy(desc(h.createdAt)).limit(300);
    const [counts] = await db.select({
      all: sql<number>`count(*)::int`, mrp: sql<number>`count(*) filter (where ${h.mrpRaised})::int`, coupon: sql<number>`count(*) filter (where ${h.kind} = 'COUPON_LIMIT')::int`,
      big: sql<number>`count(*) filter (where ${h.kind} = 'PRICE' and ${h.mrpPaiseAfter} > 0 and (${h.mrpPaiseAfter} - ${h.pricePaiseAfter}) * 100 >= 70 * ${h.mrpPaiseAfter})::int`,
    }).from(h).where(gte(h.createdAt, sql`now() - make_interval(days => ${days})`));
    return NextResponse.json({ days, show, counts, items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
