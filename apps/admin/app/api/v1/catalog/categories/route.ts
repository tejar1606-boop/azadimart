import { requireStaff } from "@azadimart/auth";
import { auditLogs, categories, createDatabase, products } from "@azadimart/database";
import { AppError, adminCategoryCreateSchema, toApiError } from "@azadimart/shared";
import { and, asc, count, eq, isNull, like, max, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

function slugifyCategory(name: string): string {
  return name.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "category";
}

/** All categories (active and inactive) in display order, with product counts. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "any");
    const db = createDatabase();
    const [rows, counts] = await Promise.all([
      db.select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId, isActive: categories.isActive, sortOrder: categories.sortOrder, metaTitle: categories.metaTitle, metaDescription: categories.metaDescription, description: categories.description, imageUrl: categories.imageUrl })
        .from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
      db.select({ categoryId: products.categoryId, total: count() }).from(products).groupBy(products.categoryId),
    ]);
    const live = await db.select({ categoryId: products.categoryId, total: count() }).from(products).where(eq(products.status, "LIVE")).groupBy(products.categoryId);
    return NextResponse.json({
      items: rows.map((row) => ({
        ...row,
        productCount: counts.find((c) => c.categoryId === row.id)?.total ?? 0,
        liveCount: live.find((c) => c.categoryId === row.id)?.total ?? 0,
      })),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Create a category (top level, or under a parent). It goes to the end of its group. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "catalog");
    const input = adminCategoryCreateSchema.parse(await request.json());
    const db = createDatabase();
    const created = await db.transaction(async (tx) => {
      const parentId = input.parentId ?? null;
      if (parentId) {
        const parent = (await tx.select({ id: categories.id, parentId: categories.parentId }).from(categories).where(eq(categories.id, parentId)).limit(1))[0];
        if (!parent) throw new AppError("VALIDATION_ERROR", "Parent category not found");
        if (parent.parentId) throw new AppError("VALIDATION_ERROR", "Sub-categories can only be one level deep");
      }
      const duplicate = (await tx.select({ id: categories.id }).from(categories)
        .where(and(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId), eq(categories.name, input.name))).limit(1))[0];
      if (duplicate) throw new AppError("CONFLICT", `A category called "${input.name}" already exists here`);

      const base = slugifyCategory(input.name);
      const taken = new Set((await tx.select({ slug: categories.slug }).from(categories).where(or(eq(categories.slug, base), like(categories.slug, base + "-%")))).map((r) => r.slug));
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

      const group = parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId);
      const last = (await tx.select({ value: max(categories.sortOrder) }).from(categories).where(group))[0]?.value ?? 0;
      let sortOrder = last + 1;
      if (input.position) {
        // Number the group 1, 2, 3… in its current order, then make room at the chosen position.
        const siblings = await tx.select({ id: categories.id }).from(categories).where(group).orderBy(asc(categories.sortOrder), asc(categories.name));
        sortOrder = Math.min(input.position, siblings.length + 1);
        if (siblings.length) {
          const values = sql.join(siblings.map((s, i) => sql`(${s.id}::uuid, ${i + 1 >= sortOrder ? i + 2 : i + 1}::int)`), sql`, `);
          await tx.execute(sql`update categories set sort_order = v.pos, updated_at = now() from (values ${values}) as v(id, pos) where categories.id = v.id`);
        }
      }
      const row = (await tx.insert(categories).values({ name: input.name, slug, parentId, isActive: true, sortOrder }).returning())[0]!;
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "CATEGORY_CREATED", entityType: "category", entityId: row.id, metadata: { name: row.name, parentId } });
      return row;
    });
    return NextResponse.json({ category: created }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
