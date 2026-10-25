import { requireApiAccess, enforceRateLimit } from "@azadimart/auth";
import { cartItems, carts, couponRedemptions, coupons, createDatabase, orders, products, productVariants } from "@azadimart/database";
import { AppError, allocateCoupon, couponValidationSchema, toApiError } from "@azadimart/shared";
import { and, count, eq, gt, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";

const bodySchema = couponValidationSchema.omit({ code: true });

/**
 * The best offer for this cart, applied automatically at checkout so shoppers
 * don't need a code: the live coupon that saves the most and that this
 * shopper can still use (same rules as checkout). None → { code: null }.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    const db = createDatabase();
    await enforceRateLimit(db, request, "coupon", { subject: session.userId });
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const input = bodySchema.parse(await request.json());
    const cart = (await db.select({ id: carts.id }).from(carts).where(and(eq(carts.id, input.cartId), eq(carts.customerId, session.customerId))).limit(1))[0];
    if (!cart) throw new AppError("NOT_FOUND", "Cart not found");

    const lines = (await db.select({
      cartItemId: cartItems.id, productId: products.id, categoryId: products.categoryId, sellerId: products.sellerId, couponMaxDiscountPct: products.couponMaxDiscountPct,
      quantity: cartItems.quantity, pricePaise: productVariants.pricePaise, variantActive: productVariants.isActive, productStatus: products.status,
    }).from(cartItems).innerJoin(productVariants, eq(cartItems.variantId, productVariants.id)).innerJoin(products, eq(productVariants.productId, products.id))
      .where(input.variantIds ? and(eq(cartItems.cartId, cart.id), inArray(cartItems.variantId, input.variantIds)) : eq(cartItems.cartId, cart.id)))
      .filter((l) => l.quantity > 0 && l.variantActive && l.productStatus === "LIVE")
      .map((l) => ({ key: l.cartItemId, productId: l.productId, categoryId: l.categoryId, sellerId: l.sellerId, lineTotalPaise: l.pricePaise * l.quantity, couponMaxDiscountPct: l.couponMaxDiscountPct }));
    if (!lines.length) return NextResponse.json({ code: null });

    const now = new Date();
    const live = (await db.select().from(coupons).where(and(eq(coupons.isActive, true), isNull(coupons.deletedAt), lte(coupons.startsAt, now), or(isNull(coupons.endsAt), gt(coupons.endsAt, now)))).limit(200))
      .filter((c) => c.discountType !== "FREE_SHIPPING" && (c.usageLimit === null || c.usageCount < c.usageLimit));
    const offers = live.map((c) => ({ coupon: c, allocation: allocateCoupon(c, lines) }))
      .filter((o) => !o.allocation.problem && o.allocation.discountPaise > 0)
      .sort((a, b) => b.allocation.discountPaise - a.allocation.discountPaise);
    if (!offers.length) return NextResponse.json({ code: null });

    const used = new Map((await db.select({ couponId: couponRedemptions.couponId, n: count() }).from(couponRedemptions)
      .where(and(eq(couponRedemptions.customerId, session.customerId), inArray(couponRedemptions.couponId, offers.map((o) => o.coupon.id)))).groupBy(couponRedemptions.couponId)).map((r) => [r.couponId, Number(r.n)]));
    const ordered = Boolean((await db.select({ id: orders.id }).from(orders).where(and(eq(orders.customerId, session.customerId), ne(orders.status, "CANCELLED"))).limit(1))[0]);
    const best = offers.find((o) => (used.get(o.coupon.id) ?? 0) < o.coupon.perCustomerLimit && !(o.coupon.firstOrderOnly && ordered));
    return NextResponse.json(best ? { code: best.coupon.code, discountPaise: best.allocation.discountPaise } : { code: null });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
