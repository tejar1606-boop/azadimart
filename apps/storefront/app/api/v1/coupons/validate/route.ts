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
import { AppError, couponValidationSchema, toApiError } from "@azadimart/shared";
import { and, count, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

type CartLine = {
  productId: string;
  categoryId: string;
  sellerId: string;
  quantity: number;
  pricePaise: number;
  variantActive: boolean;
  productStatus: string;
};

function matchesScope(
  scope: { productIds?: string[]; categoryIds?: string[]; sellerIds?: string[] },
  line: CartLine,
) {
  const hasProductScope = Boolean(scope.productIds?.length);
  const hasCategoryScope = Boolean(scope.categoryIds?.length);
  const hasSellerScope = Boolean(scope.sellerIds?.length);

  if (!hasProductScope && !hasCategoryScope && !hasSellerScope) return true;

  return Boolean(
    (hasProductScope && scope.productIds?.includes(line.productId)) ||
      (hasCategoryScope && scope.categoryIds?.includes(line.categoryId)) ||
      (hasSellerScope && scope.sellerIds?.includes(line.sellerId)),
  );
}

function calculateDiscount(
  coupon: {
    discountType: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
    discountValue: number;
    maximumDiscountPaise: number | null;
  },
  eligibleSubtotalPaise: number,
) {
  if (eligibleSubtotalPaise <= 0 || coupon.discountType === "FREE_SHIPPING") return 0;

  const raw =
    coupon.discountType === "PERCENTAGE"
      ? Math.floor((eligibleSubtotalPaise * coupon.discountValue) / 100)
      : coupon.discountValue;

  const capped =
    coupon.maximumDiscountPaise !== null
      ? Math.min(raw, coupon.maximumDiscountPaise)
      : raw;

  return Math.min(eligibleSubtotalPaise, Math.max(0, capped));
}

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
        productId: products.id,
        categoryId: products.categoryId,
        sellerId: products.sellerId,
        quantity: cartItems.quantity,
        pricePaise: productVariants.pricePaise,
        variantActive: productVariants.isActive,
        productStatus: products.status,
      })
      .from(cartItems)
      .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(eq(cartItems.cartId, cart.id));

    const lines = rows.filter(
      (line) => line.quantity > 0 && line.variantActive && line.productStatus === "LIVE",
    );

    const scope = (coupon.scope ?? {}) as {
      productIds?: string[];
      categoryIds?: string[];
      sellerIds?: string[];
    };
    // Seller-funded coupons only discount that seller's lines.
    const eligibleLines = lines.filter(
      (line) => matchesScope(scope, line) && (!coupon.sellerId || line.sellerId === coupon.sellerId),
    );
    const eligibleSubtotalPaise = eligibleLines.reduce(
      (sum, line) => sum + line.pricePaise * line.quantity,
      0,
    );

    if (eligibleLines.length === 0) {
      throw new AppError("UNPROCESSABLE", "Coupon is not applicable to this cart");
    }

    if (eligibleSubtotalPaise < coupon.minimumOrderPaise) {
      throw new AppError(
        "UNPROCESSABLE",
        "The cart does not meet the coupon minimum order value",
        { minimumOrderPaise: coupon.minimumOrderPaise, eligibleSubtotalPaise },
      );
    }

    if (coupon.sellerId && !eligibleLines.some((line) => line.sellerId === coupon.sellerId)) {
      throw new AppError("UNPROCESSABLE", "Coupon is not applicable to this cart");
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

    const discountPaise = calculateDiscount(coupon, eligibleSubtotalPaise);

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
