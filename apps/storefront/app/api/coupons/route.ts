import { createDatabase, coupons } from "@azadimart/database";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const db=createDatabase();
  const now=new Date();
  const rows=await db.select({
    id:coupons.id, code:coupons.code, title:coupons.title, description:coupons.description,
    discountType:coupons.discountType, discountValue:coupons.discountValue,
    minimumOrderPaise:coupons.minimumOrderPaise, maximumDiscountPaise:coupons.maximumDiscountPaise,
    startsAt:coupons.startsAt, endsAt:coupons.endsAt,
  }).from(coupons).where(eq(coupons.isActive,true));
  return NextResponse.json({coupons:rows.filter(c=>c.startsAt<=now && (!c.endsAt || c.endsAt>now)).slice(0,12)});
}