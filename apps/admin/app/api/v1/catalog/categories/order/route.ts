import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, categories, createDatabase } from "@azadimart/database";
import { AppError, adminCategoryOrderSchema, toApiError } from "@azadimart/shared";
import { inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Save the order of sibling categories (top level, or within one parent). */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { ids } = adminCategoryOrderSchema.parse(await request.json());
    const db = createDatabase();
    await db.transaction(async (tx) => {
      const rows = await tx.select({ id: categories.id, parentId: categories.parentId }).from(categories).where(inArray(categories.id, ids));
      if (rows.length !== ids.length) throw new AppError("VALIDATION_ERROR", "Unknown category");
      if (new Set(rows.map((r) => r.parentId ?? "")).size > 1) throw new AppError("VALIDATION_ERROR", "Only categories in the same group can be reordered together");
      const values = sql.join(ids.map((id, index) => sql`(${id}::uuid, ${index + 1}::int)`), sql`, `);
      await tx.execute(sql`update categories set sort_order = v.pos, updated_at = now() from (values ${values}) as v(id, pos) where categories.id = v.id`);
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: "CATEGORIES_REORDERED", entityType: "category", entityId: ids[0]!, metadata: { ids } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
