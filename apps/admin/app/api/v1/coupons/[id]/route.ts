import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, coupons } from "@azadimart/database";
import { AppError, couponSchema, toApiError } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = couponSchema.partial().parse(await request.json());
    const db = createDatabase();
    const existing = (await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.id, params.id)).limit(1))[0];
    if (!existing) throw new AppError("NOT_FOUND", "Coupon not found");

    const patch: Record<string, unknown> = {};
    if (input.code) patch.code = input.code;
    if (input.title) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.discountType) patch.discountType = input.discountType;
    if (input.discountValue !== undefined) patch.discountValue = input.discountType === "PERCENTAGE" ? Math.min(input.discountValue, 100) : input.discountValue;
    if (input.minimumOrderPaise !== undefined) patch.minimumOrderPaise = input.minimumOrderPaise;
    if (input.maximumDiscountPaise !== undefined) patch.maximumDiscountPaise = input.maximumDiscountPaise;
    if (input.startsAt) patch.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (input.usageLimit !== undefined) patch.usageLimit = input.usageLimit;
    if (input.perCustomerLimit !== undefined) patch.perCustomerLimit = input.perCustomerLimit;
    if (input.firstOrderOnly !== undefined) patch.firstOrderOnly = input.firstOrderOnly;
    if (input.stackable !== undefined) patch.stackable = input.stackable;
    if (input.fundingType) patch.fundingType = input.fundingType;
    if (input.sellerId !== undefined) patch.sellerId = input.sellerId ?? null;
    if (input.scope) patch.scope = input.scope;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    patch.updatedAt = new Date();

    const row = (await db.update(coupons).set(patch).where(eq(coupons.id, params.id)).returning())[0];
    return NextResponse.json({ coupon: row });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    const existing = (await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.id, params.id)).limit(1))[0];
    if (!existing) throw new AppError("NOT_FOUND", "Coupon not found");
    await db.update(coupons).set({ isActive: false, updatedAt: new Date() }).where(eq(coupons.id, params.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}