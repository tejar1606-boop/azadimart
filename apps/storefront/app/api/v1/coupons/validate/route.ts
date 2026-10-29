import { requireApiAccess, enforceRateLimit } from "@azadimart/auth";
import {
  cartItems,
  carts,
  couponRedemptions,
  coupons,
  createDatabase,
  orders,
  products,
  productVariants,
} from "@azadimart/database";
import { AppError, allocateCoupon, couponValidationSchema, toApiError } from "@azadimart/shared";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    await enforceRateLimit(createDatabase(), request, "coupon", { subject: session.userId });
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");

    const input = couponValidationSchema.parse(await request.json());
    const db = createDatabase();

    const coupon = (
      await db
        .select()
        .from(coupons)
        .where(and(eq(coupons.code, input.code), eq(coupons.isActive, true)))
        .limit(1)
    )[0];

    if (!coupon) throw new AppError("NOT_FOUND", "Coupon code is not available");

    const now = new Date();
    if (coupon.startsAt > now || (coupon.endsAt && coupon.endsAt <= now)) {
      throw new AppError("UNPROCESSABLE", "Coupon is outside its valid date range");
    }

    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new AppError("UNPROCESSABLE", "Coupon usage limit has been reached");
    }

    const cart = (
      await db
        .select({ id: carts.id })
        .from(carts)
        .where(and(eq(carts.id, input.cartId), eq(carts.customerId, session.customerId)))
        .limit(1)
    )[0];

    if (!cart) throw new AppError("NOT_FOUND", "Cart not found");

    const rows = await db
      .select({
        cartItemId: cartItems.id,
        productId: products.id,
        categoryId: products.categoryId,
        couponMaxDiscountPct: products.couponMaxDiscountPct,
        sellerId: products.sellerId,
        quantity: cartItems.quantity,
        pricePaise: productVariants.pricePaise,
        variantActive: productVariants.isActive,
        productStatus: products.status,
      })
      .from(cartItems)
      .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      // Buy now validates the coupon against just the item being bought.
      .where(input.variantIds ? and(eq(cartItems.cartId, cart.id), inArray(cartItems.variantId, input.variantIds)) : eq(cartItems.cartId, cart.id));

    const lines = rows.filter(
      (line) => line.quantity > 0 && line.variantActive && line.productStatus === "LIVE",
    );

    // Same rules as checkout: seller coupons only discount that seller's products, and
    // coupons paid by sellers only products whose seller allows that much off.
    const allocation = allocateCoupon(coupon, lines.map((line) => ({
      key: line.cartItemId, productId: line.productId, categoryId: line.categoryId, sellerId: line.sellerId,
      lineTotalPaise: line.pricePaise * line.quantity, couponMaxDiscountPct: line.couponMaxDiscountPct,
    })));
    const eligibleSubtotalPaise = allocation.eligibleSubtotalPaise;
    if (allocation.problem === "NOT_APPLICABLE") {
      throw new AppError("UNPROCESSABLE", coupon.fundingType === "SELLERS" ? "This coupon isn't available on the products in your cart" : "Coupon is not applicable to this cart");
    }
    if (allocation.problem === "MINIMUM") {
      throw new AppError(
        "UNPROCESSABLE",
        "The cart does not meet the coupon minimum order value",
        { minimumOrderPaise: coupon.minimumOrderPaise, eligibleSubtotalPaise },
      );
    }

    const customerRedemptions =
      (
        await db
          .select({ value: count() })
          .from(couponRedemptions)
          .where(
            and(
              eq(couponRedemptions.couponId, coupon.id),
              eq(couponRedemptions.customerId, session.customerId),
            ),
          )
      )[0]?.value ?? 0;

    if (customerRedemptions >= coupon.perCustomerLimit) {
      throw new AppError("UNPROCESSABLE", "You have already used this coupon the maximum number of times");
    }

    if (coupon.firstOrderOnly) {
      const previousOrder = (
        await db
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.customerId, session.customerId),
              ne(orders.status, "CANCELLED"),
            ),
          )
          .limit(1)
      )[0];

      if (previousOrder) {
        throw new AppError("UNPROCESSABLE", "This coupon is only valid on your first order");
      }
    }

    const discountPaise = allocation.discountPaise;

    return NextResponse.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      eligibleSubtotalPaise,
      discountPaise,
      freeShipping: coupon.discountType === "FREE_SHIPPING",
      message:
        discountPaise > 0 || coupon.discountType === "FREE_SHIPPING"
          ? "Coupon applied"
          : "Coupon is valid",
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
