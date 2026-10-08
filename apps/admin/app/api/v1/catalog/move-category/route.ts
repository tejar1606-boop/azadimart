import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, categories, createDatabase, products } from "@azadimart/database";
import { AppError, adminMoveCategorySchema, toApiError } from "@azadimart/shared";
import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Move one or more products to another category (each move is audited with the old category). */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = adminMoveCategorySchema.parse(await request.json());
    const db = createDatabase();
    const moved = await db.transaction(async (tx) => {
      const target = (await tx.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.id, input.categoryId)).limit(1))[0];
      if (!target) throw new AppError("VALIDATION_ERROR", "Category not found");
      const rows = await tx.select({ id: products.id, categoryId: products.categoryId }).from(products).where(inArray(products.id, input.productIds)).for("update");
      if (rows.length !== input.productIds.length) throw new AppError("NOT_FOUND", "Product not found");
      const changing = rows.filter((r) => r.categoryId !== target.id);
      if (!changing.length) return 0;
      await tx.update(products).set({ categoryId: target.id, updatedAt: new Date() }).where(inArray(products.id, changing.map((r) => r.id)));
      await tx.insert(auditLogs).values(changing.map((r) => ({
        actorUserId: principal.userId, action: "PRODUCT_CATEGORY_CHANGED", entityType: "product", entityId: r.id,
        metadata: { from: r.categoryId, to: target.id, toName: target.name },
      })));
      return changing.length;
    });
    return NextResponse.json({ ok: true, moved });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
