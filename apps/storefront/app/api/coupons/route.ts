import { createDatabase, coupons } from "@azadimart/database";
import { and, asc, gt, isNull, or, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const db = createDatabase();
  const now = new Date();
  const rows = await db.select({
    id: coupons.id,
    code: coupons.code,
    title: coupons.title,
    description: coupons.description,
    discountType: coupons.discountType,
    discountValue: coupons.discountValue,
    minimumOrderPaise: coupons.minimumOrderPaise,
    maximumDiscountPaise: coupons.maximumDiscountPaise,
    startsAt: coupons.startsAt,
    endsAt: coupons.endsAt,
  }).from(coupons).where(and(
    eq(coupons.isActive, true),
    coupons.startsAt ? undefined : undefined,
  )).orderBy(asc(coupons.startsAt));
  const active = rows.filter((row) => row.startsAt <= now && (!row.endsAt || row.endsAt > now));
  return NextResponse.json({ coupons: active.slice(0, 12) });
}