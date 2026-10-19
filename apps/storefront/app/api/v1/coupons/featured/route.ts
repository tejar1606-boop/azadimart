import { coupons, createDatabase } from "@azadimart/database";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { NextResponse } from "next/server";

/** The newest active store-wide coupons (sign-in / register offers): up to 3, newest first. */
export async function GET() {
  try {
    const now = new Date();
    const rows = await createDatabase()
      .select({ code: coupons.code, title: coupons.title, discountType: coupons.discountType, discountValue: coupons.discountValue, minimumOrderPaise: coupons.minimumOrderPaise })
      .from(coupons)
      .where(and(eq(coupons.isActive, true), isNull(coupons.sellerId), lte(coupons.startsAt, now), or(isNull(coupons.endsAt), gt(coupons.endsAt, now))))
      .orderBy(desc(coupons.createdAt)).limit(3);
    return NextResponse.json({ coupons: rows, coupon: rows[0] ?? null }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ coupons: [], coupon: null });
  }
}
