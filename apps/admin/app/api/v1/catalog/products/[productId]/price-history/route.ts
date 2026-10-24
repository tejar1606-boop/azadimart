import { requireStaff } from "@azadimart/auth";
import { createDatabase, productPriceHistory, productVariants, products, users } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";

/** Every price / MRP change of a product, newest first, with who asked and who approved. */
export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, ["catalog", "marketing"]);
    const { productId } = await params;
    if (!uuidSchema.safeParse(productId).success) throw new AppError("NOT_FOUND", "Product not found");
    const requester = alias(users, "requester"), approver = alias(users, "approver");
    const items = await createDatabase().select({
      id: productPriceHistory.id, sku: productPriceHistory.sku, variantTitle: productPriceHistory.variantTitle,
      pricePaiseBefore: productPriceHistory.pricePaiseBefore, pricePaiseAfter: productPriceHistory.pricePaiseAfter,
      mrpPaiseBefore: productPriceHistory.mrpPaiseBefore, mrpPaiseAfter: productPriceHistory.mrpPaiseAfter,
      source: productPriceHistory.source, mrpRaised: productPriceHistory.mrpRaised, createdAt: productPriceHistory.createdAt,
      kind: productPriceHistory.kind, couponPctBefore: productPriceHistory.couponPctBefore, couponPctAfter: productPriceHistory.couponPctAfter,
      requestedBy: requester.email, requestedByRole: requester.role, approvedBy: approver.email,
    }).from(productPriceHistory)
      .leftJoin(requester, eq(requester.id, productPriceHistory.requestedByUserId))
      .leftJoin(approver, eq(approver.id, productPriceHistory.approvedByUserId))
      .where(eq(productPriceHistory.productId, productId)).orderBy(desc(productPriceHistory.createdAt)).limit(200);
    // Now: the coupon limit and the lowest price a customer can pay (cheapest size, biggest seller-paid coupon allowed).
    const db = createDatabase();
    const [product] = await db.select({ couponPct: products.couponMaxDiscountPct }).from(products).where(eq(products.id, productId)).limit(1);
    const [cheapest] = await db.select({ pricePaise: productVariants.pricePaise, compareAtPaise: productVariants.compareAtPaise }).from(productVariants)
      .where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true))).orderBy(asc(productVariants.pricePaise)).limit(1);
    const couponPct = product?.couponPct ?? 0;
    const current = cheapest ? { couponPct, lowestPricePaise: cheapest.pricePaise, mrpPaise: cheapest.compareAtPaise, lowestWithCouponPaise: Math.round(cheapest.pricePaise * (100 - couponPct) / 100) } : null;
    return NextResponse.json({ items, current });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
