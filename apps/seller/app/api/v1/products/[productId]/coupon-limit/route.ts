import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, couponLimitOf, createDatabase, products, recordCouponLimitChange } from "@azadimart/database";
import { AppError, productCouponLimitSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * The most LOIMART coupons may take off this product (paid from the
 * seller's payout). 0 takes it out of seller-paid coupons. Applies to new
 * orders straight away; orders already placed keep their discount.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const productId = uuidSchema.parse((await params).productId);
    const { couponMaxDiscountPct } = productCouponLimitSchema.parse(await request.json());
    const db = createDatabase();
    const sellerId = principal.sellerId;
    await db.transaction(async (tx) => {
      const own = (await tx.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.sellerId, sellerId))).limit(1).for("update"))[0];
      if (!own) throw new AppError("NOT_FOUND", "Product not found");
      const before = await couponLimitOf(tx, productId);
      await tx.update(products).set({ couponMaxDiscountPct, updatedAt: new Date() }).where(eq(products.id, productId));
      // Shows in Admin's price history and Discount changes (applies at once: it's the seller's own money).
      await recordCouponLimitChange(tx, productId, before, couponMaxDiscountPct, { source: "SELLER_COUPON_LIMIT", requestedByUserId: principal.userId });
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "PRODUCT_COUPON_LIMIT_SET", entityType: "product", entityId: productId, metadata: { from: before, to: couponMaxDiscountPct } });
    });
    return NextResponse.json({ ok: true, couponMaxDiscountPct });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
