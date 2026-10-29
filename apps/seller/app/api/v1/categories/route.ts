import { requireApiAccess } from "@azadimart/auth";
import { categories, createDatabase, sellers } from "@azadimart/database";
import { eq, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { toApiError } from "@azadimart/shared";

/** Active categories, each with the GST it gives products (its own, else its parent's). */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) return NextResponse.json({ items: [] }, { status: 403 });
    const db = createDatabase();
    const seller = (await db.select({ id: sellers.id }).from(sellers).where(eq(sellers.id, principal.sellerId)).limit(1))[0];
    if (!seller) return NextResponse.json({ items: [] }, { status: 403 });
    const rows = await db.select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId, hsnCode: categories.hsnCode, gstRateBps: categories.gstRateBps, priceLimitPaise: categories.gstPriceLimitPaise, rateAboveLimitBps: categories.gstRateAboveLimitBps })
      .from(categories).where(eq(categories.isActive,true)).orderBy(asc(categories.sortOrder), asc(categories.name));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = rows.map(({ parentId, hsnCode, gstRateBps, priceLimitPaise, rateAboveLimitBps, ...rest }) => {
      const own = hsnCode && gstRateBps != null ? { hsnCode, gstRateBps, priceLimitPaise, rateAboveLimitBps } : null;
      const up = parentId ? byId.get(parentId) : undefined;
      const inherited = up?.hsnCode && up.gstRateBps != null ? { hsnCode: up.hsnCode, gstRateBps: up.gstRateBps, priceLimitPaise: up.priceLimitPaise, rateAboveLimitBps: up.rateAboveLimitBps } : null;
      return { ...rest, gst: own ?? inherited };
    });
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
