import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, categories, createDatabase, products } from "@azadimart/database";
import { AppError, adminCategoryUpdateSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, isNull, max, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Rename, show/hide, or move a category under another parent. */
export async function PATCH(request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { categoryId } = await params;
    if (!uuidSchema.safeParse(categoryId).success) throw new AppError("NOT_FOUND", "Category not found");
    const input = adminCategoryUpdateSchema.parse(await request.json());
    const db = createDatabase();
    const updated = await db.transaction(async (tx) => {
      const current = (await tx.select().from(categories).where(eq(categories.id, categoryId)).limit(1).for("update"))[0];
      if (!current) throw new AppError("NOT_FOUND", "Category not found");
      const parentId = input.parentId === undefined ? current.parentId : input.parentId;
      const changes: Partial<typeof categories.$inferInsert> = { updatedAt: new Date() };

      if (input.parentId !== undefined && input.parentId !== current.parentId) {
        if (parentId) {
          if (parentId === categoryId) throw new AppError("VALIDATION_ERROR", "A category can't be inside itself");
          const parent = (await tx.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, parentId)).limit(1))[0];
          if (!parent) throw new AppError("VALIDATION_ERROR", "Parent category not found");
          if (parent.parentId) throw new AppError("VALIDATION_ERROR", "Sub-categories can only be one level deep");
          const children = await tx.select({ id: categories.id }).from(categories).where(eq(categories.parentId, categoryId)).limit(1);
          if (children.length) throw new AppError("VALIDATION_ERROR", "This category has sub-categories, so it must stay at the top level");
        }
        const last = (await tx.select({ value: max(categories.sortOrder) }).from(categories).where(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId)))[0]?.value ?? 0;
        changes.parentId = parentId;
        changes.sortOrder = last + 1;
      }
      if (input.name !== undefined && input.name !== current.name) {
        const duplicate = (await tx.select({ id: categories.id }).from(categories)
          .where(and(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId), eq(categories.name, input.name), ne(categories.id, categoryId))).limit(1))[0];
        if (duplicate) throw new AppError("CONFLICT", `A category called "${input.name}" already exists here`);
        changes.name = input.name; // The web address (slug) stays the same so existing links keep working.
      }
      if (input.isActive !== undefined) changes.isActive = input.isActive;
      if (input.metaTitle !== undefined) changes.metaTitle = input.metaTitle || null;
      if (input.metaDescription !== undefined) changes.metaDescription = input.metaDescription || null;
      if (input.description !== undefined) changes.description = input.description || null;

      const row = (await tx.update(categories).set(changes).where(eq(categories.id, categoryId)).returning())[0]!;
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "CATEGORY_UPDATED", entityType: "category", entityId: categoryId, metadata: { before: { name: current.name, isActive: current.isActive, parentId: current.parentId }, after: { name: row.name, isActive: row.isActive, parentId: row.parentId } } });
      return row;
    });
    return NextResponse.json({ category: updated });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Delete an empty category: no products (in any status) and no sub-categories. */
export async function DELETE(request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { categoryId } = await params;
    if (!uuidSchema.safeParse(categoryId).success) throw new AppError("NOT_FOUND", "Category not found");
    const db = createDatabase();
    await db.transaction(async (tx) => {
      const current = (await tx.select().from(categories).where(eq(categories.id, categoryId)).limit(1).for("update"))[0];
      if (!current) throw new AppError("NOT_FOUND", "Category not found");
      const used = await tx.select({ id: products.id }).from(products).where(eq(products.categoryId, categoryId)).limit(1);
      if (used.length) throw new AppError("CONFLICT", "This category still has products. Move them to another category first, or hide the category instead.");
      const children = await tx.select({ id: categories.id }).from(categories).where(eq(categories.parentId, categoryId)).limit(1);
      if (children.length) throw new AppError("CONFLICT", "Delete or move its sub-categories first.");
      await tx.delete(categories).where(eq(categories.id, categoryId));
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "CATEGORY_DELETED", entityType: "category", entityId: categoryId, metadata: { name: current.name, slug: current.slug } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
