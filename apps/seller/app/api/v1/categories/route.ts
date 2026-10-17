import { requireApiAccess } from "@azadimart/auth";
import { categories, createDatabase, sellers } from "@azadimart/database";
import { eq, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { toApiError } from "@azadimart/shared";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) return NextResponse.json({ items: [] }, { status: 403 });
    const db = createDatabase();
    const seller = (await db.select({ id: sellers.id }).from(sellers).where(eq(sellers.id, principal.sellerId)).limit(1))[0];
    if (!seller) return NextResponse.json({ items: [] }, { status: 403 });
    const items = await db.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories).where(eq(categories.isActive,true)).orderBy(asc(categories.sortOrder), asc(categories.name));
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
