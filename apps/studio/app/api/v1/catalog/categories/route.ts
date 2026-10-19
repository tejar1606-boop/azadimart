import { requireStaff } from "@azadimart/auth";
import { categories, createDatabase } from "@azadimart/database";
import { toApiError } from "@azadimart/shared";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Category names for banner pickers (read-only; categories are managed in Admin). */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "banners");
    const items = await createDatabase()
      .select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId, isActive: categories.isActive })
      .from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
