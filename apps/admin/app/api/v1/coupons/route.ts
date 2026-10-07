import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, coupons } from "@azadimart/database";
import { AppError, couponSchema, toApiError } from "@azadimart/shared";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    const rows = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
    return NextResponse.json({ coupons: rows });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = couponSchema.parse(await request.json());
    const db = createDatabase();
    const existing = (await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, input.code)).limit(1))[0];
    if (existing) throw new AppError("CONFLICT", "Coupon code already exists");

    const row = (await db.insert(coupons).values({
      code: input.code,
      title: input.title,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountType === "PERCENTAGE" ? Math.min(input.discountValue, 100) : input.discountValue,
      minimumOrderPaise: input.minimumOrderPaise,
      maximumDiscountPaise: input.maximumDiscountPaise ?? null,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      usageLimit: input.usageLimit ?? null,
      perCustomerLimit: input.perCustomerLimit,
      firstOrderOnly: input.firstOrderOnly,
      stackable: input.stackable,
      fundingType: input.fundingType,
      sellerId: input.sellerId ?? null,
      scope: input.scope,
      isActive: input.isActive,
    }).returning())[0];

    return NextResponse.json({ coupon: row }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}