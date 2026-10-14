import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, products } from "@azadimart/database";
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
    const updated = await db.update(products).set({ couponMaxDiscountPct, updatedAt: new Date() })
      .where(and(eq(products.id, productId), eq(products.sellerId, principal.sellerId))).returning({ id: products.id });
    if (!updated.length) throw new AppError("NOT_FOUND", "Product not found");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "PRODUCT_COUPON_LIMIT_SET", entityType: "product", entityId: productId, metadata: { couponMaxDiscountPct } });
    return NextResponse.json({ ok: true, couponMaxDiscountPct });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
