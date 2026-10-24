import { requireStaff } from "@azadimart/auth";
import { auditLogs, categories, createDatabase, coupons, products, sellers } from "@azadimart/database";
import { AppError, couponSchema, toApiError } from "@azadimart/shared";
import { desc, eq, inArray, isNull } from "drizzle-orm";

type Db = ReturnType<typeof createDatabase>;
type Scope = { productIds?: string[]; categoryIds?: string[]; sellerIds?: string[] };

/** "All products", or e.g. "Gallardo, Light" / "Fashion" / "Bharat Demo Store". */
async function scopeLabels(db: Db, rows: Array<{ id: string; scope: Scope | null }>) {
  const ids = (k: keyof Scope) => [...new Set(rows.flatMap((r) => r.scope?.[k] ?? []))];
  const [prods, cats, sels] = await Promise.all([
    ids("productIds").length ? db.select({ id: products.id, name: products.title }).from(products).where(inArray(products.id, ids("productIds"))) : [],
    ids("categoryIds").length ? db.select({ id: categories.id, name: categories.name }).from(categories).where(inArray(categories.id, ids("categoryIds"))) : [],
    ids("sellerIds").length ? db.select({ id: sellers.id, name: sellers.storeName }).from(sellers).where(inArray(sellers.id, ids("sellerIds"))) : [],
  ]);
  const name = new Map([...prods, ...cats, ...sels].map((x) => [x.id, x.name]));
  return new Map(rows.map((r) => {
    const parts = [
      r.scope?.productIds?.length ? "Products: " + r.scope.productIds.map((i) => name.get(i) ?? "removed product").join(", ") : "",
      r.scope?.categoryIds?.length ? "Categories: " + r.scope.categoryIds.map((i) => name.get(i) ?? "removed category").join(", ") : "",
      r.scope?.sellerIds?.length ? "Sellers: " + r.scope.sellerIds.map((i) => name.get(i) ?? "removed seller").join(", ") : "",
    ].filter(Boolean);
    return [r.id, parts.length ? parts.join(" · ") : "All products"];
  }));
}
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, ["marketing", "orders"]);
    const db = createDatabase();
    const rows = await db.select().from(coupons).where(isNull(coupons.deletedAt)).orderBy(desc(coupons.createdAt));
    const labels = await scopeLabels(db, rows);
    // Details of the products a coupon is limited to, so the coupon can be edited.
    const productIds = [...new Set(rows.flatMap((r) => (r.scope as Scope | null)?.productIds ?? []))];
    const scoped = productIds.length ? await db.select({ id: products.id, title: products.title, sellerId: products.sellerId, sellerName: sellers.storeName, couponMaxDiscountPct: products.couponMaxDiscountPct })
      .from(products).innerJoin(sellers, eq(sellers.id, products.sellerId)).where(inArray(products.id, productIds)) : [];
    return NextResponse.json({ coupons: rows.map((c) => ({ ...c, appliesTo: labels.get(c.id), scopeProducts: scoped.filter((p) => ((c.scope as Scope | null)?.productIds ?? []).includes(p.id)) })) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "marketing");
    const input = couponSchema.parse(await request.json());
    const db = createDatabase();
    const existing = (await db.select({ id: coupons.id, deletedAt: coupons.deletedAt }).from(coupons).where(eq(coupons.code, input.code)).limit(1))[0];
    if (existing) throw new AppError("CONFLICT", existing.deletedAt ? "This code belonged to a deleted coupon that was used on orders, so it can't be reused. Pick another code." : "Coupon code already exists");

    // Chosen products must exist; a single seller's coupon can only cover that seller's products.
    const warnings: string[] = [];
    if (input.scope.productIds.length) {
      const chosen = await db.select({ id: products.id, title: products.title, sellerId: products.sellerId, status: products.status, limit: products.couponMaxDiscountPct })
        .from(products).where(inArray(products.id, input.scope.productIds));
      if (chosen.length !== input.scope.productIds.length) throw new AppError("VALIDATION_ERROR", "One of the chosen products no longer exists");
      if (input.fundingType === "SELLER") {
        const others = chosen.filter((p) => p.sellerId !== input.sellerId);
        if (others.length) throw new AppError("VALIDATION_ERROR", `These products belong to another seller, so this seller's coupon can't cover them: ${others.map((p) => p.title).join(", ")}`);
      }
      if (input.fundingType === "SELLERS" && input.discountType === "PERCENTAGE") {
        for (const p of chosen.filter((x) => x.limit < input.discountValue)) {
          warnings.push(`${p.title}: its seller allows coupons up to ${p.limit}% off, so this ${input.discountValue}% coupon won't apply there until they raise it.`);
        }
      }
      for (const p of chosen.filter((x) => x.status !== "LIVE")) warnings.push(`${p.title} isn't live on the store right now.`);
    }

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

    if (row) {
      await db.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: "COUPON_CREATED",
        entityType: "coupon",
        entityId: row.id,
        metadata: { code: row.code, discountType: row.discountType, discountValue: row.discountValue },
      });
    }
    const label = row ? (await scopeLabels(db, [row])).get(row.id) : undefined;
    return NextResponse.json({ coupon: row ? { ...row, appliesTo: label } : row, warnings }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}