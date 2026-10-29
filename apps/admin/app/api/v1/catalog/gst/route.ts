import { requireStaff } from "@azadimart/auth";
import { auditLogs, categories, createDatabase, products } from "@azadimart/database";
import { categoryGstUpdateSchema, toApiError } from "@azadimart/shared";
import { asc, count, eq, isNotNull, isNull, and } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Every category's HSN code and GST rate, with how many products use their own HSN or have none at all. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "catalog");
    const db = createDatabase();
    const [rows, own] = await Promise.all([
      db.select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId, isActive: categories.isActive, hsnCode: categories.hsnCode, gstRateBps: categories.gstRateBps, priceLimitPaise: categories.gstPriceLimitPaise, rateAboveLimitBps: categories.gstRateAboveLimitBps })
        .from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
      db.select({ categoryId: products.categoryId, total: count() }).from(products).where(isNotNull(products.hsnCode)).groupBy(products.categoryId),
    ]);
    const totals = await db.select({ categoryId: products.categoryId, total: count() }).from(products).where(and(isNull(products.hsnCode), eq(products.status, "LIVE"))).groupBy(products.categoryId);
    return NextResponse.json({ items: rows.map((r) => ({ ...r, ownHsnCount: own.find((o) => o.categoryId === r.id)?.total ?? 0, liveUsingCategory: totals.find((t) => t.categoryId === r.id)?.total ?? 0 })) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Saves categories' HSN codes and GST rates. New orders use them; past orders and invoices keep theirs. */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "catalog");
    const { items } = categoryGstUpdateSchema.parse(await request.json());
    const db = createDatabase();
    await db.transaction(async (tx) => {
      for (const item of items) {
        const before = (await tx.select({ hsnCode: categories.hsnCode, gstRateBps: categories.gstRateBps, priceLimitPaise: categories.gstPriceLimitPaise, rateAboveLimitBps: categories.gstRateAboveLimitBps }).from(categories).where(eq(categories.id, item.categoryId)).limit(1))[0];
        if (!before) continue;
        if (before.hsnCode === item.hsnCode && before.gstRateBps === item.gstRateBps && before.priceLimitPaise === item.priceLimitPaise && before.rateAboveLimitBps === item.rateAboveLimitBps) continue;
        await tx.update(categories).set({ hsnCode: item.hsnCode, gstRateBps: item.gstRateBps, gstPriceLimitPaise: item.priceLimitPaise, gstRateAboveLimitBps: item.rateAboveLimitBps, updatedAt: new Date() }).where(eq(categories.id, item.categoryId));
        await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "CATEGORY_GST_CHANGED", entityType: "category", entityId: item.categoryId, metadata: { before, after: item } });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
